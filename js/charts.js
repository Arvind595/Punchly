let analyticsChart = null;

window.updateAnalytics = function() {
    const history = Storage.getHistory();
    const tableBody = document.getElementById('historyTableBody');
    tableBody.innerHTML = '';

    // Populate Table (Last 7 entries for simplicity in minimal view)
    const recentHistory = [...history].reverse().slice(0, 7);
    recentHistory.forEach(record => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${record.date}</td>
            <td>${record.in || '--:--'}</td>
            <td>${record.out || '--:--'}</td>
            <td>${record.total}</td>
            <td>${record.targetMet ? '✅' : '⏳'}</td>
        `;
        tableBody.appendChild(tr);
    });

    // Prepare Chart Data
    const labels = recentHistory.map(r => r.date).reverse();
    const data = recentHistory.map(r => {
        const [h, m] = r.total.replace('m','').split('h ');
        return parseFloat(h) + (parseFloat(m) / 60);
    }).reverse();

    const ctx = document.getElementById('analyticsChart').getContext('2d');
    
    // Get CSS variables for theme-aware chart colors
    const computedStyle = getComputedStyle(document.documentElement);
    const accentColor = computedStyle.getPropertyValue('--accent-color').trim();
    const textColor = computedStyle.getPropertyValue('--text-primary').trim();
    const gridColor = computedStyle.getPropertyValue('--border-color').trim();

    if (analyticsChart) {
        analyticsChart.destroy();
    }

    analyticsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Hours Worked',
                data: data,
                backgroundColor: accentColor,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: textColor }
                }
            },
            plugins: {
                legend: { labels: { color: textColor } }
            }
        }
    });
};