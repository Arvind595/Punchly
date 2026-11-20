document.addEventListener('DOMContentLoaded', () => {
    
    // Export to Excel (SheetJS)
    document.getElementById('exportExcel').addEventListener('click', () => {
        const history = Storage.getHistory();
        if (history.length === 0) return alert("No data to export.");
        
        const ws = XLSX.utils.json_to_sheet(history);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "TimeSheet");
        XLSX.writeFile(wb, "Punchly_Timesheet.xlsx");
    });

    // Export to PDF (html2pdf)
    document.getElementById('exportPDF').addEventListener('click', () => {
        const element = document.getElementById('chartExportArea');
        const opt = {
            margin:       1,
            filename:     'Punchly_Analytics.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'landscape' }
        };
        html2pdf().set(opt).from(element).save();
    });

    // Export to Image (html2canvas)
    document.getElementById('exportImage').addEventListener('click', () => {
        const element = document.getElementById('chartExportArea');
        html2canvas(element).then(canvas => {
            const link = document.createElement('a');
            link.download = 'Punchly_Chart.png';
            link.href = canvas.toDataURL();
            link.click();
        });
    });
});