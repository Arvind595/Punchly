const Storage = {
    keys: {
        TODAY: 'punchly_today_state',
        HISTORY: 'punchly_history',
        SETTINGS: 'punchly_settings'
    },

    saveToday(data) {
        localStorage.setItem(this.keys.TODAY, JSON.stringify(data));
    },

    getToday() {
        const data = localStorage.getItem(this.keys.TODAY);
        return data ? JSON.parse(data) : null;
    },

    saveRecord(record) {
        const history = this.getHistory();
        const existingIndex = history.findIndex(r => r.date === record.date);
        
        if (existingIndex >= 0) {
            history[existingIndex] = record;
        } else {
            history.push(record);
        }
        
        localStorage.setItem(this.keys.HISTORY, JSON.stringify(history));
    },

    getHistory() {
        const data = localStorage.getItem(this.keys.HISTORY);
        return data ? JSON.parse(data) : [];
    },

    saveSettings(settings) {
        localStorage.setItem(this.keys.SETTINGS, JSON.stringify(settings));
    },

    getSettings() {
        const data = localStorage.getItem(this.keys.SETTINGS);
        return data ? JSON.parse(data) : { targetShift: '08:20', theme: 'light' };
    }
};