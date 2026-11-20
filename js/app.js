document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const tabs = document.querySelectorAll('.tab-btn');
    const panes = document.querySelectorAll('.tab-pane');
    const inputs = document.querySelectorAll('.punch-input');
    const nowBtns = document.querySelectorAll('.btn-now');
    const targetShiftInput = document.getElementById('targetShift');
    const targetOutDisplay = document.getElementById('targetOutDisplay');
    const totalWorkedDisplay = document.getElementById('totalWorkedDisplay');
    const progressBar = document.getElementById('shiftProgressBar');
    const themeToggle = document.getElementById('themeToggle');

    // Initialization
    const settings = Storage.getSettings();
    document.documentElement.setAttribute('data-theme', settings.theme);
    targetShiftInput.value = settings.targetShift;

    const todayData = Storage.getToday();
    if (todayData && todayData.date === new Date().toLocaleDateString()) {
        inputs.forEach(input => {
            if (todayData[input.id]) input.value = todayData[input.id];
        });
    }

    // Event Listeners
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.target).classList.add('active');
            if (tab.dataset.target === 'history-view') {
                if (window.updateAnalytics) window.updateAnalytics();
            }
        });
    });

    themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        settings.theme = next;
        Storage.saveSettings(settings);
    });

    nowBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.target.dataset.target;
            const input = document.getElementById(targetId);
            const now = new Date();
            const timeString = now.getHours().toString().padStart(2, '0') + ':' + 
                               now.getMinutes().toString().padStart(2, '0');
            input.value = timeString;
            calculateTimes();
        });
    });

    inputs.forEach(input => input.addEventListener('change', calculateTimes));
    targetShiftInput.addEventListener('change', () => {
        settings.targetShift = targetShiftInput.value;
        Storage.saveSettings(settings);
        calculateTimes();
    });

    document.getElementById('saveDayBtn').addEventListener('click', () => {
        const record = {
            date: new Date().toLocaleDateString(),
            in: document.getElementById('morningIn').value,
            out: document.getElementById('eveningOut').value || '--:--',
            total: totalWorkedDisplay.textContent,
            targetMet: document.getElementById('eveningOut').value ? true : false
        };
        Storage.saveRecord(record);
        alert("Today's record saved to History.");
    });

    // Core Logic
    function timeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    }

    function minutesToTime(mins) {
        const h = Math.floor(mins / 60).toString().padStart(2, '0');
        const m = (mins % 60).toString().padStart(2, '0');
        return `${h}:${m}`;
    }

    function calculateTimes() {
        const t1 = timeToMinutes(document.getElementById('morningIn').value);
        const t2 = timeToMinutes(document.getElementById('lunchOut').value);
        const t3 = timeToMinutes(document.getElementById('lunchReturn').value);
        const t4 = timeToMinutes(document.getElementById('eveningOut').value);
        const target = timeToMinutes(targetShiftInput.value);

        let morningWorked = 0;
        let eveningWorked = 0;

        if (t1 && t2 && t2 >= t1) morningWorked = t2 - t1;
        if (t3 && t4 && t4 >= t3) eveningWorked = t4 - t3;

        const totalWorked = morningWorked + eveningWorked;
        
        // Auto-save partial state
        Storage.saveToday({
            date: new Date().toLocaleDateString(),
            morningIn: document.getElementById('morningIn').value,
            lunchOut: document.getElementById('lunchOut').value,
            lunchReturn: document.getElementById('lunchReturn').value,
            eveningOut: document.getElementById('eveningOut').value
        });

        // Calculate Target Out
        if (t1 && t2 && t3) {
            const remaining = target - morningWorked;
            const targetOutMins = t3 + remaining;
            targetOutDisplay.textContent = minutesToTime(targetOutMins);
        } else {
            targetOutDisplay.textContent = "--:--";
        }

        // Display Total Worked
        const h = Math.floor(totalWorked / 60);
        const m = totalWorked % 60;
        totalWorkedDisplay.textContent = `${h}h ${m}m`;

        // Update Progress Bar
        const progress = Math.min((totalWorked / target) * 100, 100);
        progressBar.style.width = `${progress}%`;
    }

    // Initial calculation
    calculateTimes();
});