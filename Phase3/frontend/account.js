const API_URL = "/api";

// Shared language helpers (i18n.js)
const { setText, setRaw, setMoney, setDate, showError, makeError, fromResponse } = SmartStore;

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const logoutButton = document.getElementById("logout-button");

    if (loginForm) {
        loginForm.addEventListener("submit", loginCustomer);
    }

    if (registerForm) {
        registerForm.addEventListener("submit", registerCustomer);
    }

    if (logoutButton) {
        logoutButton.addEventListener("click", logoutCustomer);
    }

    if (document.getElementById("customer-greeting")) {
        loadDashboard();
    }

    const closeButton = document.getElementById("close-details");

    if (closeButton) {
        closeButton.addEventListener("click", () => {
            document.getElementById("transaction-details").hidden = true;
        });
    }
});


// Message element used by the current page.
function messageElement() {
    return document.getElementById("form-message")
        || document.getElementById("dashboard-message");
}

// Display a message (a translation key) on the current page.
function showMessage(key, isError = false, vars) {
    const element = messageElement();
    if (!element) return;

    setText(element, key, vars);
    element.classList.toggle("error", isError);
}

// Display an error (translated when possible) on the current page.
function showFailure(error, fallbackKey) {
    const element = messageElement();
    if (!element) return;

    showError(element, error, fallbackKey);
    element.classList.add("error");
}


// CUSTOMER LOGIN
async function loginCustomer(event) {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
        const response = await fetch(`${API_URL}/customer/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw response.status === 401
                ? makeError("err_login_failed")
                : fromResponse(data, "err_login_generic");
        }

        window.location.href = data.customer && data.customer.role === 1 ? "admin.html" : "account.html";

    } catch (error) {
        showFailure(error, "err_login_generic");
    }
}


// CUSTOMER REGISTRATION
async function registerCustomer(event) {
    event.preventDefault();

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
        const response = await fetch(`${API_URL}/customer/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify({ name, email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw fromResponse(data, "err_register_failed");
        }

        // Registration automatically logs the customer in.
        window.location.href = "account.html";

    } catch (error) {
        showFailure(error, "err_register_failed");
    }
}


// LOAD CUSTOMER DASHBOARD
// (The link to admin.html for administrators is added by qol.js.)
async function loadDashboard() {
    try {
        const customerResponse = await fetch(`${API_URL}/customer/me`, {
            credentials: "same-origin"
        });

        if (customerResponse.status === 401) {
            window.location.href = "login.html";
            return;
        }

        const customerData = await customerResponse.json();

        if (!customerResponse.ok) {
            throw fromResponse(customerData, "err_load_profile");
        }

        const customer = customerData.customer;

        setText(document.getElementById("customer-greeting"), "acct_hello", {
            name: customer.name
        });

        const membership = document.getElementById("membership-number");
        if (customer.membership_number) {
            setRaw(membership, customer.membership_number);
        } else {
            setText(membership, "not_assigned");
        }

        document.getElementById("customer-points").textContent =
            customer.points ?? 0;

        await loadTransactions();

    } catch (error) {
        showFailure(error, "err_load_profile");
    }
}


// LOAD TRANSACTION HISTORY
async function loadTransactions() {
    const transactionList = document.getElementById("transaction-list");

    try {
        const response = await fetch(`${API_URL}/customer/transactions`, {
            credentials: "same-origin"
        });

        if (response.status === 401) {
            window.location.href = "login.html";
            return;
        }

        const data = await response.json();

        if (!response.ok) {
            throw fromResponse(data, "err_load_transactions");
        }

        const transactions = data.transactions || [];

        document.getElementById("transaction-count").textContent =
            transactions.length;

        transactionList.replaceChildren();

        if (transactions.length === 0) {
            const emptyMessage = document.createElement("p");
            emptyMessage.className = "history-message";
            setText(emptyMessage, "tx_empty");
            transactionList.appendChild(emptyMessage);
            return;
        }

        transactions.forEach(transaction => {
            const card = document.createElement("div");
            card.className = "transaction-card";

            const information = document.createElement("div");
            information.className = "transaction-information";

            const title = document.createElement("h3");
            setText(title, "tx_title", { id: transaction.transaction_id });

            const date = document.createElement("p");
            setDate(date, transaction.date);

            const points = document.createElement("p");
            setText(points, "points_earned", { n: transaction.points_earned });

            const total = document.createElement("strong");
            setMoney(total, transaction.total);

            const detailsButton = document.createElement("button");
            detailsButton.type = "button";
            detailsButton.className = "transaction-details-btn";
            setText(detailsButton, "view_details");

            detailsButton.addEventListener("click", () => {
                loadTransactionDetails(transaction.transaction_id);
            });

            information.append(title, date, points);

            const rightSide = document.createElement("div");
            rightSide.className = "transaction-right";
            rightSide.append(total, detailsButton);

            card.append(information, rightSide);
            transactionList.appendChild(card);
        });

    } catch (error) {
        showError(transactionList, error, "err_load_transactions");
    }
}


// LOAD ONE TRANSACTION'S DETAILS
async function loadTransactionDetails(transactionId) {
    try {
        const response = await fetch(
            `${API_URL}/customer/transactions/${transactionId}`,
            {
                credentials: "same-origin"
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw fromResponse(data, "err_load_details");
        }

        const detailsSection = document.getElementById("transaction-details");
        const itemsContainer = document.getElementById("transaction-items");

        itemsContainer.replaceChildren();

        setDate(document.getElementById("detail-transaction-date"), data.transaction.date);
        setMoney(document.getElementById("detail-total"), data.transaction.total);
        setText(document.getElementById("detail-points"), "points_earned", {
            n: data.transaction.points_earned
        });

        (data.items || []).forEach(item => {
            const row = document.createElement("div");
            row.className = "transaction-item";

            const name = document.createElement("span");
            name.textContent = `${item.product_name} × ${item.quantity}`;

            const lineTotal = document.createElement("strong");
            setMoney(lineTotal, item.line_total);

            row.append(name, lineTotal);
            itemsContainer.appendChild(row);
        });

        detailsSection.hidden = false;
        detailsSection.scrollIntoView({ behavior: "smooth" });

    } catch (error) {
        showFailure(error, "err_load_details");
    }
}


// CUSTOMER LOGOUT
async function logoutCustomer() {
    try {
        const response = await fetch(`${API_URL}/customer/logout`, {
            method: "POST",
            credentials: "same-origin"
        });

        if (!response.ok) {
            throw makeError("err_logout");
        }

        window.location.href = "index.html";

    } catch (error) {
        showFailure(error, "err_logout");
    }
}
