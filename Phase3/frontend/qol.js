/* SmartStore Quality-of-Life & Accessibility Manager
   (text size, light/dark theme, language toggle, admin shortcut)
   Requires i18n.js to be loaded first. */
(function () {
    const THEME_KEY = "smartstore-theme";
    const FONT_KEY = "smartstore-font-scale";
    const SCALES = [0.9, 1, 1.125, 1.25]; // 90%, 100%, 112.5%, 125%

    const S = window.SmartStore;
    const t = (key, vars) => (S ? S.t(key, vars) : key);

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
        const bar = document.querySelector(".qol-toolbar");
        const themeBtn = document.getElementById("qol-theme-btn");
        const decBtn = document.getElementById("qol-font-dec");
        const incBtn = document.getElementById("qol-font-inc");
        const label = document.getElementById("qol-font-label");
        const langBtn = document.getElementById("qol-lang-btn");

        if (bar) bar.setAttribute("aria-label", t("qol_toolbar"));
        const group = document.getElementById("qol-font-group");
        if (group) group.setAttribute("aria-label", t("qol_text_size"));

        if (themeBtn) {
            themeBtn.title = isDark ? t("qol_to_light") : t("qol_to_dark");
            themeBtn.setAttribute("aria-label", themeBtn.title);
            themeBtn.innerHTML = isDark
                ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg><span>${t("qol_light")}</span>`
                : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg><span>${t("qol_dark")}</span>`;
        }
        if (decBtn) { decBtn.disabled = scaleIndex === 0; decBtn.title = t("qol_smaller"); decBtn.setAttribute("aria-label", t("qol_smaller")); }
        if (incBtn) { incBtn.disabled = scaleIndex === SCALES.length - 1; incBtn.title = t("qol_bigger"); incBtn.setAttribute("aria-label", t("qol_bigger")); }
        if (label) label.textContent = `${Math.round(SCALES[scaleIndex] * 100)}%`;

        if (langBtn && S) {
            // The button shows the language you will switch TO.
            langBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><span>${S.lang === "en" ? "FR" : "EN"}</span>`;
            langBtn.title = t("qol_switch_lang");
            langBtn.setAttribute("aria-label", t("qol_switch_lang"));
            langBtn.setAttribute("lang", S.lang === "en" ? "fr" : "en");
        }
    }

    /* ---------- session-aware bits ----------
       One call to /api/customer/me drives:
         - the admin shortcut (cart / account nav, welcome page),
         - the welcome page's "log out" option (instead of log in / register),
         - the greeting on the cart page. */
    async function fetchCustomer() {
        try {
            const response = await fetch("/api/customer/me", { credentials: "same-origin" });
            if (!response.ok) return null; // not logged in
            return (await response.json()).customer || null;
        } catch (e) { return null; }
    }

    function renderCartGreeting(customer) {
        const heading = document.querySelector(".cart-intro h1");
        if (!heading) return;

        let greeting = document.getElementById("cart-greeting");
        if (!customer) { if (greeting) greeting.remove(); return; }

        if (!greeting) {
            greeting = document.createElement("p");
            greeting.id = "cart-greeting";
            greeting.className = "cart-greeting";
            heading.insertAdjacentElement("afterend", greeting);
        }
        S.setText(greeting, "cart_greeting", { name: customer.name });
    }

    function makeLink(key, href) {
        const link = document.createElement("a");
        link.href = href;
        S.setText(link, key);
        return link;
    }

    function renderNavAdminLink(customer) {
        const nav = document.querySelector(".account-nav, .cart-nav");
        if (!nav) return;

        nav.querySelectorAll("[data-admin-link]").forEach(el => el.remove());
        if (!customer || customer.role !== 1) return;

        const link = document.createElement("a");
        link.href = "admin.html";
        link.setAttribute("data-admin-link", "");

        if (nav.querySelector("[data-lucide], svg")) {   // match the icon style of the cart header
            const icon = document.createElement("i");
            icon.setAttribute("data-lucide", "package");
            link.appendChild(icon);
        }
        const text = document.createElement("span");
        S.setText(text, "nav_admin");
        link.appendChild(text);

        nav.insertBefore(link, nav.querySelector("#logout-button") || null);
        if (window.lucide) window.lucide.createIcons();
    }

    // Welcome page: logged-out visitors see log in / register, logged-in ones see log out.
    let guestLinks = null;
    function renderWelcomeLinks(customer) {
        const box = document.querySelector(".welcome-account-links");
        if (!box) return;
        if (guestLinks === null) guestLinks = Array.from(box.childNodes);

        if (!customer) { box.replaceChildren(...guestLinks); return; }

        const hello = document.createElement("p");
        S.setText(hello, "home_signed_in", { name: customer.name });

        const children = [hello, makeLink("nav_account", "account.html")];

        if (customer.role === 1) {
            const admin = makeLink("nav_admin", "admin.html");
            admin.setAttribute("data-admin-link", "");
            children.push(admin);
        }

        const logout = makeLink("nav_logout", "#");
        logout.id = "home-logout";
        logout.setAttribute("role", "button");
        const status = document.createElement("p");
        status.className = "account-message error";
        status.setAttribute("role", "alert");

        logout.addEventListener("click", async event => {
            event.preventDefault();
            try {
                const response = await fetch("/api/customer/logout", {
                    method: "POST", credentials: "same-origin"
                });
                if (!response.ok) throw new Error();
                window.location.reload();
            } catch (e) {
                S.setText(status, "err_logout");
            }
        });

        children.push(logout, status);
        box.replaceChildren(...children);
    }

    async function refreshSession() {
        const customer = await fetchCustomer();
        renderCartGreeting(customer);
        renderNavAdminLink(customer);
        renderWelcomeLinks(customer);
    }

    // Lets page scripts (e.g. the cart after a membership card scan) update the greeting.
    if (S) S.refreshSession = refreshSession;

    document.addEventListener("DOMContentLoaded", () => {
        const bar = document.createElement("aside");
        bar.className = "qol-toolbar";

        bar.innerHTML = `
            <div class="qol-group" id="qol-font-group" role="group">
                <button type="button" id="qol-font-dec" class="qol-btn">A-</button>
                <span id="qol-font-label" class="qol-scale-label">100%</span>
                <button type="button" id="qol-font-inc" class="qol-btn">A+</button>
            </div>
            <div class="qol-divider"></div>
            <button type="button" id="qol-theme-btn" class="qol-btn qol-theme-btn"></button>
            <div class="qol-divider"></div>
            <button type="button" id="qol-lang-btn" class="qol-btn qol-lang-btn"></button>
        `;

        document.body.appendChild(bar);

        document.getElementById("qol-font-dec").addEventListener("click", () => changeFontSize(-1));
        document.getElementById("qol-font-inc").addEventListener("click", () => changeFontSize(1));
        document.getElementById("qol-theme-btn").addEventListener("click", () => {
            const current = document.documentElement.getAttribute("data-theme");
            setTheme(current === "dark" ? "light" : "dark");
        });
        document.getElementById("qol-lang-btn").addEventListener("click", () => {
            if (S) S.setLang(S.lang === "en" ? "fr" : "en");
        });

        document.addEventListener("smartstore:languagechange", updateControls);

        updateControls();
        if (S) refreshSession();
    });
})();
