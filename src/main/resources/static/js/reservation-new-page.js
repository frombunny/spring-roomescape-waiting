const reservationForm = document.getElementById("reservation-form");
const reservationNameInput = document.getElementById("reservation-name");
const reservationDateInput = document.getElementById("reservation-date");
const themeSelect = document.getElementById("theme-select");
const availableTimesContainer = document.getElementById("available-times");
const availabilitySummary = document.getElementById("availability-summary");
const reservationFeedback = document.getElementById("reservation-feedback");
const reservationSubmitButton = document.getElementById("reservation-submit");
const selectedSummary = document.getElementById("selected-summary");

let selectedTimeId = null;
let times = [];

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

function updateSubmitState() {
    reservationSubmitButton.disabled = !selectedTimeId;
}

function updateSummary() {
    const themeName = themeSelect.selectedOptions[0]?.textContent?.trim();
    const selectedTime = times.find((time) => time.id === Number(selectedTimeId));

    if (!themeSelect.value || !reservationDateInput.value) {
        selectedSummary.innerHTML = `
            <strong>예약 정보를 선택하세요.</strong>
            <span>테마와 날짜를 고르면 요약이 표시됩니다.</span>
        `;
        return;
    }

    selectedSummary.innerHTML = `
        <strong>${themeName}</strong>
        <span>${reservationDateInput.value}${selectedTime ? ` · ${formatTime(selectedTime.startAt)} · ${selectedTime.available ? "확정" : "대기"}` : ""}</span>
    `;
}

async function loadAvailableTimes() {
    clearFeedback(reservationFeedback);
    const themeId = themeSelect.value;
    const date = reservationDateInput.value;

    if (!themeId || !date) {
        times = [];
        selectedTimeId = null;
        availabilitySummary.textContent = "날짜와 테마를 선택하면 예약 가능한 시간이 표시됩니다.";
        availableTimesContainer.className = "time-grid empty-state";
        availableTimesContainer.textContent = "아직 조회된 시간이 없습니다.";
        updateSubmitState();
        updateSummary();
        return;
    }

    availabilitySummary.textContent = "예약 가능 시간을 조회하는 중입니다.";
    try {
        const [allTimes, availableData] = await Promise.all([
            request("/times", { method: "GET" }),
            request(`/times/available?themeId=${themeId}&date=${date}`, { method: "GET" })
        ]);
        const availableTimeIds = new Set((availableData.times ?? []).map((time) => time.id));
        times = (allTimes ?? []).map((time) => ({
            ...time,
            available: availableTimeIds.has(time.id)
        }));
        selectedTimeId = null;

        const availableCount = times.filter((time) => time.available).length;
        const waitingCount = times.length - availableCount;
        availabilitySummary.textContent = `${availableData.theme.name} 테마의 ${date} 확정 가능 ${availableCount}개 · 대기 가능 ${waitingCount}개`;

        if (times.length === 0) {
            availableTimesContainer.className = "time-grid empty-state";
            availableTimesContainer.textContent = "등록된 운영 시간이 없습니다.";
        } else {
            availableTimesContainer.className = "time-grid";
            availableTimesContainer.innerHTML = "";
            times.forEach((time) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = `time-chip ${time.available ? "" : "waiting"}`;
                button.innerHTML = `${formatTime(time.startAt)} <span>${time.available ? "확정" : "대기"}</span>`;
                button.onclick = () => {
                    selectedTimeId = time.id;
                    Array.from(availableTimesContainer.children).forEach(btn => btn.classList.remove("selected"));
                    button.classList.add("selected");
                    updateSubmitState();
                    updateSummary();
                };
                availableTimesContainer.appendChild(button);
            });
        }
        updateSubmitState();
        updateSummary();
    } catch (error) {
        showFeedback(reservationFeedback, "error", error.message);
    }
}

reservationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFeedback(reservationFeedback);

    const selectedTime = times.find((time) => time.id === Number(selectedTimeId));
    if (selectedTime && !selectedTime.available) {
        const wantsWaiting = window.confirm("이미 확정된 예약이 있는 시간입니다. 대기 예약으로 신청하시겠습니까?");
        if (!wantsWaiting) {
            return;
        }
    }

    const payload = {
        name: reservationNameInput.value.trim(),
        date: reservationDateInput.value,
        timeId: Number(selectedTimeId),
        themeId: Number(themeSelect.value)
    };

    try {
        const reservation = await request("/reservations", { method: "POST", body: JSON.stringify(payload) });
        showFeedback(reservationFeedback, "success", reservation.status === "WAITING"
            ? "이미 예약된 시간이라 대기 예약으로 등록되었습니다."
            : "예약이 등록되었습니다.");
        reservationNameInput.value = "";
        await loadAvailableTimes();
        const username = encodeURIComponent(payload.name);
        window.setTimeout(() => {
            window.location.href = `/reservation/me?username=${username}`;
        }, 500);
    } catch (error) {
        showFeedback(reservationFeedback, "error", error.message);
    }
});

function applyInitialTheme() {
    const themeId = new URLSearchParams(window.location.search).get("themeId");
    if (themeId && Array.from(themeSelect.options).some((option) => option.value === themeId)) {
        themeSelect.value = themeId;
        return;
    }
    if (themeSelect.options.length > 1 && !themeSelect.value) {
        themeSelect.selectedIndex = 1;
    }
}

themeSelect.addEventListener("change", loadAvailableTimes);
reservationDateInput.addEventListener("change", loadAvailableTimes);
applyInitialTheme();
loadAvailableTimes();
