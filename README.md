# Punchly ⏱️

Punchly is a modern, responsive web application designed for precise time tracking, target shift calculation, and work-hour analytics. Built with a focus on ease-of-use and data privacy, Punchly operates entirely in the browser, storing daily punch data locally and generating actionable insights without requiring a backend server.

![GitHub Pages](https://img.shields.io/badge/Hosted_on-GitHub_Pages-blue?style=flat-square&logo=github)
![License](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)

## 🚀 Live Demo
**[Access Punchly Here](https://YOUR_USERNAME.github.io/punchly)** *(Update this link after deploying to GitHub Pages)*

## ✨ Features

* **Smart Daily Tracking:** Log Morning In, Lunch Out, Lunch Return, and Evening Out times with native touch-friendly time pickers.
* **Target Shift Calculation:** Set a custom daily target (e.g., 8 hours 20 minutes). The app automatically calculates your exact required "Evening Out" time the moment you punch back in from lunch.
* **Session Persistence:** Accidentally closed the tab? Morning and afternoon punches are automatically saved to local storage and instantly reloaded when you return.
* **Data Visualization:** View weekly, monthly, and yearly historical data backed by interactive graphs and statistical summaries.
* **Export Anywhere:** Download your timesheets and charts in multiple formats (Excel/CSV, PDF, or PNG) for personal record-keeping or HR submission.
* **Refined Aesthetics:** Features a clean, matte-finish UI with minimalist typography, subtle branding, and full dark/light theme support.

## 🛠️ Technology Stack

* **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+)
* **Charting:** [Chart.js](https://www.chartjs.org/) for dynamic canvas-based analytics.
* **Exports:** 
  * [SheetJS](https://sheetjs.com/) for `.xlsx` spreadsheet generation.
  * [html2pdf.js](https://ekoopmans.github.io/html2pdf.js/) for seamless document rendering.
* **Storage:** Browser `localStorage` / IndexedDB for local data persistence.

## 💻 Local Installation & Development

Since Punchly is a client-side static app, no build steps or package managers are required to run it locally.

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/YOUR_USERNAME/punchly.git](https://github.com/YOUR_USERNAME/punchly.git)
