/* SmartStore Quality-of-Life & Accessibility Manager */
(function () {
    const THEME_KEY = "smartstore-theme";
    const FONT_KEY = "smartstore-font-scale";
    const SCALES = [0.9, 1, 1.125, 1.25]; // 90%, 100%, 112.5%, 125%

    // Apply saved theme/font preferences before first paint to prevent flashes
    const savedTheme = localStorage.getItem(THEME_KEY) ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", savedTheme);

    let scaleIndex = SCALES.indexOf(parseFloat(localStorage.getItem(FONT_KEY)));
    if (scaleIndex === -1) scaleIndex = 1;
    applyFontScale(SCALES[scaleIndex]);

    function applyFontScale(scale) {
        document.documentElement.style.fontSize = `${scale * 16}px`;
        document.documentElement.style.setProperty("--font-scale", scale);
    }

    function setTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem(THEME_KEY, theme);
        updateControls();
    }

    function changeFontSize(delta) {
        scaleIndex = Math.min(SCALES.length - 1, Math.max(0, scaleIndex + delta));
        const scale = SCALES[scaleIndex];
        localStorage.setItem(FONT_KEY, scale);
        applyFontScale(scale);
        updateControls();
    }

    function updateControls() {
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        const themeBtn = document.getElementById("qol-theme-btn");
        const decBtn = document.getElementById("qol-font-dec");
        const incBtn = document.getElementById("qol-font-inc");
        const label = document.getElementById("qol-font-label");

        if (themeBtn) {
            themeBtn.title = isDark ? "Switch to Light Mode" : "Switch to Dark Mode";
            themeBtn.innerHTML = isDark
                ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg><span>Light</span>`
                : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg><span>Dark</span>`;
        }
        if (decBtn) decBtn.disabled = scaleIndex === 0;
        if (incBtn) incBtn.disabled = scaleIndex === SCALES.length - 1;
        if (label) label.textContent = `${Math.round(SCALES[scaleIndex] * 100)}%`;
    }

    document.addEventListener("DOMContentLoaded", () => {
        const bar = document.createElement("aside");
        bar.className = "qol-toolbar";
        bar.setAttribute("aria-label", "Display and accessibility settings");

        bar.innerHTML = `
            <div class="qol-group" role="group" aria-label="Text size">
                <button type="button" id="qol-font-dec" class="qol-btn" title="Make text smaller">A-</button>
                <span id="qol-font-label" class="qol-scale-label">100%</span>
                <button type="button" id="qol-font-inc" class="qol-btn" title="Make text bigger">A+</button>
            </div>
            <div class="qol-divider"></div>
            <button type="button" id="qol-theme-btn" class="qol-btn qol-theme-btn"></button>
        `;

        document.body.appendChild(bar);

        document.getElementById("qol-font-dec").addEventListener("click", () => changeFontSize(-1));
        document.getElementById("qol-font-inc").addEventListener("click", () => changeFontSize(1));
        document.getElementById("qol-theme-btn").addEventListener("click", () => {
            const current = document.documentElement.getAttribute("data-theme");
            setTheme(current === "dark" ? "light" : "dark");
        });

        updateControls();
    });
})();