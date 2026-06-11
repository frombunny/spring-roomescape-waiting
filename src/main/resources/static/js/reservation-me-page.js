const checkForm = document.getElementById("check-form");
const checkNameInput = document.getElementById("check-name");
const myReservationList = document.getElementById("my-reservation-list");
const checkFeedback = document.getElementById("check-feedback");
const themeSelect = document.getElementById("theme-select");

let inlineEditState = {
    reservationId: null,
    times: [],
    selectedTimeId: null
};

function showFeedback(element, type, message) {
    element.hidden = false;
    element.className = `feedback ${type}`;
    element.textContent = message;
}

function clearFeedback(element) {
    element.hidden = true;
    element.className = "feedback";
    element.textContent = "";
}

function formatTime(time) {
    return (time ?? "").slice(0, 5);
}

function formatStatus(reservation) {
    if (reservation.status === "RESERVED") {
        return "예약 확정";
    }
    if (reservation.status === "WAITING") {
        return reservation.waitingOrder ? `예약 대기 ${reservation.waitingOrder}순위` : "예약 대기";
    }
    if (reservation.status === "CANCELED") {
        return "예약 취소";
    }
    return reservation.status ?? "상태 없음";
}

function statusClass(status) {
    return `status-badge ${String(status ?? "").toLowerCase()}`;
}

async function request(url, options = {}) {
    const response = await fetch(url, {
        headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
        ...options
    });
    if (!response.ok) {
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
            const error = await response.json();
            throw new Error(error.message || "요청 처리 중 문제가 발생했습니다.");
        }
        const message = await response.text();
        throw new Error(message || "요청 처리 중 문제가 발생했습니다.");
    }
    if (response.status === 204) return null;
    return response.json();
}

function renderMyReservations(reservations, username) {
    myReservationList.className = "my-reservation-list has-items";

    if (reservations.length === 0) {
        myReservationList.innerHTML = '<div class="empty-card">조회된 예약이 없습니다.</div>';
        return;
    }

    myReservationList.innerHTML = "";

    reservations.forEach((reservation) => {
        const isEditing = inlineEditState.reservationId === reservation.id;
        const article = document.createElement("article");
        article.className = "my-reservation-item";

        if (isEditing) {
            const themesHtml = Array.from(themeSelect.options)
                .filter(opt => opt.value !== "")
                .map(opt => `<option value="${opt.value}" ${opt.value == reservation.theme.id ? "selected" : ""}>${opt.text}</option>`)
                .join("");

            article.innerHTML = `
                <div class="inline-edit-card">
                    <div class="inline-edit-header">
                        <strong>예약 변경</strong>
                        <span class="${statusClass(reservation.status)}">${formatStatus(reservation)}</span>
                    </div>

                    <div class="inline-edit-fields">
                        <input type="text" class="edit-name" value="${reservation.name}" placeholder="예약자 이름" required>
                        <input type="date" class="edit-date" value="${reservation.date}" required>
                        <select class="edit-theme" required>
                            ${themesHtml}
                        </select>
                    </div>

                    <div class="edit-times time-grid empty-state inline-edit-times">
                        시간을 조회 중입니다...
                    </div>
                    <div class="inline-edit-actions">
                        <button class="button ghost cancel-edit-btn" type="button">취소</button>
                        <button class="button primary save-edit-btn" type="button" disabled>수정 완료</button>
                    </div>
                </div>
            `;

            const nameInput = article.querySelector(".edit-name");
            const dateInput = article.querySelector(".edit-date");
            const themeInput = article.querySelector(".edit-theme");
            const timesContainer = article.querySelector(".edit-times");
            const saveBtn = article.querySelector(".save-edit-btn");
            const cancelBtn = article.querySelector(".cancel-edit-btn");

            const loadInlineTimes = async () => {
                saveBtn.disabled = true;
                inlineEditState.selectedTimeId = null;
                const date = dateInput.value;
                const themeId = themeInput.value;

                timesContainer.innerHTML = "조회 중...";
                timesContainer.className = "edit-times time-grid empty-state inline-edit-times";

                try {
                    const [allTimes, availableData] = await Promise.all([
                        request("/times", { method: "GET" }),
                        request(`/times/available?themeId=${themeId}&date=${date}`)
                    ]);
                    const availableTimeIds = new Set((availableData.times ?? []).map((time) => time.id));
                    inlineEditState.times = (allTimes ?? []).map((time) => {
                        const isCurrentActiveReservation = reservation.status === "RESERVED"
                            && date === reservation.date
                            && String(themeId) === String(reservation.theme.id)
                            && time.id === reservation.time.id;
                        return {
                            ...time,
                            available: availableTimeIds.has(time.id) || isCurrentActiveReservation
                        };
                    });

                    if (date === reservation.date && String(themeId) === String(reservation.theme.id)) {
                        inlineEditState.selectedTimeId = reservation.time.id;
                    }

                    renderInlineTimes();
                } catch (e) {
                    timesContainer.innerHTML = "시간 조회 실패";
                }
            };

            const renderInlineTimes = () => {
                if (inlineEditState.times.length === 0) {
                    timesContainer.innerHTML = "등록된 운영 시간이 없습니다.";
                    saveBtn.disabled = true;
                    return;
                }

                timesContainer.className = "edit-times time-grid";
                timesContainer.innerHTML = "";
                inlineEditState.times.forEach(t => {
                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = `time-chip ${t.available ? "" : "waiting"} ${inlineEditState.selectedTimeId === t.id ? "selected" : ""}`;
                    btn.innerHTML = `${formatTime(t.startAt)} <span>${t.available ? "확정" : "대기"}</span>`;
                    btn.onclick = () => {
                        inlineEditState.selectedTimeId = t.id;
                        renderInlineTimes();
                    };
                    timesContainer.appendChild(btn);
                });

                saveBtn.disabled = !inlineEditState.selectedTimeId;
            };

            dateInput.addEventListener("change", loadInlineTimes);
            themeInput.addEventListener("change", loadInlineTimes);

            cancelBtn.onclick = () => {
                inlineEditState.reservationId = null;
                renderMyReservations(reservations, username);
            };

            saveBtn.onclick = async () => {
                const newName = nameInput.value.trim();

                if (!newName) {
                    alert("예약자 이름을 입력해주세요.");
                    nameInput.focus();
                    return;
                }

                clearFeedback(checkFeedback);
                const selectedTime = inlineEditState.times.find((time) => time.id === Number(inlineEditState.selectedTimeId));
                const isUnchanged = newName === reservation.name
                    && dateInput.value === reservation.date
                    && String(themeInput.value) === String(reservation.theme.id)
                    && Number(inlineEditState.selectedTimeId) === reservation.time.id;
                if (isUnchanged) {
                    inlineEditState.reservationId = null;
                    renderMyReservations(reservations, username);
                    return;
                }
                if (selectedTime && !selectedTime.available) {
                    const wantsWaiting = window.confirm("이미 확정된 예약이 있는 시간입니다. 대기 예약으로 변경하시겠습니까?");
                    if (!wantsWaiting) {
                        return;
                    }
                }

                const payload = {
                    username: newName,
                    date: dateInput.value,
                    themeId: Number(themeInput.value),
                    timeId: inlineEditState.selectedTimeId
                };
                try {
                    const changedReservation = await request(`/reservations/${reservation.id}`, {
                        method: "PATCH",
                        body: JSON.stringify(payload)
                    });

                    showFeedback(checkFeedback, "success", changedReservation.status === "WAITING"
                        ? "이미 예약된 시간이라 대기 상태로 변경되었습니다."
                        : "예약이 확정 상태로 변경되었습니다.");
                    inlineEditState.reservationId = null;

                    if (username !== newName) {
                        checkNameInput.value = newName;
                    }
                    checkForm.dispatchEvent(new Event("submit"));
                } catch (error) {
                    showFeedback(checkFeedback, "error", error.message);
                }
            };

            loadInlineTimes();
        } else {
            article.innerHTML = `
                <div class="my-reservation-view">
                    <div>
                        <div class="my-reservation-title">
                            <strong>${reservation.theme.name}</strong>
                            <span class="${statusClass(reservation.status)}">${formatStatus(reservation)}</span>
                        </div>
                        <p class="my-reservation-meta">
                            ${reservation.date} · ${formatTime(reservation.time.startAt)}
                        </p>
                    </div>
                    <div class="my-reservation-actions">
                        <button class="button secondary inline-edit-btn" type="button">수정</button>
                        <button class="button danger inline-cancel-btn" type="button">취소</button>
                    </div>
                </div>
            `;

            article.querySelector(".inline-edit-btn").onclick = () => {
                inlineEditState.reservationId = reservation.id;
                renderMyReservations(reservations, username);
            };

            article.querySelector(".inline-cancel-btn").onclick = async () => {
                if (!window.confirm("이 예약을 정말 취소하시겠습니까?")) return;
                clearFeedback(checkFeedback);
                try {
                    await request(`/reservations/${reservation.id}?username=${encodeURIComponent(username)}`, { method: "DELETE" });
                    showFeedback(checkFeedback, "success", "예약이 성공적으로 취소되었습니다.");
                    checkForm.dispatchEvent(new Event("submit"));
                } catch (error) {
                    showFeedback(checkFeedback, "error", error.message);
                }
            };
        }

        myReservationList.appendChild(article);
    });
}

checkForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFeedback(checkFeedback);
    inlineEditState.reservationId = null;

    const name = checkNameInput.value.trim();
    try {
        const reservations = await request(`/reservations?username=${encodeURIComponent(name)}`, { method: "GET" });
        renderMyReservations(reservations, name);
    } catch (error) {
        showFeedback(checkFeedback, "error", error.message);
    }
});

const initialUsername = new URLSearchParams(window.location.search).get("username");
if (initialUsername) {
    checkNameInput.value = initialUsername;
    checkForm.dispatchEvent(new Event("submit"));
}
