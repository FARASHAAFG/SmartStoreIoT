const API_URL = "/api";

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

    if (document.getElementById("customer-name")) {
        loadDashboard();
    }

    const closeButton = document.getElementById("close-details");

    if (closeButton) {
        closeButton.addEventListener("click", () => {
            document.getElementById("transaction-details").hidden = true;
        });
    }
});


// Display a message on the current page.
function showMessage(message, isError = false) {
    const messageElement = document.getElementById("form-message")
        || document.getElementById("dashboard-message");

    if (!messageElement) return;

    messageElement.textContent = message;
    messageElement.classList.toggle("error", isError);
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
            throw new Error(data.error || data.message || "Login failed.");
        }

        window.location.href = "account.html";

    } catch (error) {
        showMessage(error.message, true);
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
            throw new Error(data.error || data.message || "Registration failed.");
        }

        // Registration automatically logs the customer in.
        window.location.href = "account.html";

    } catch (error) {
        showMessage(error.message, true);
    }
}


// LOAD CUSTOMER DASHBOARD
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
            throw new Error(customerData.error || "Could not load customer profile.");
        }

        const customer = customerData.customer;

        document.getElementById("customer-name").textContent = customer.name;
        document.getElementById("membership-number").textContent =
            customer.membership_number || "Not assigned";

        document.getElementById("customer-points").textContent =
            customer.points ?? 0;

        await loadTransactions();

    } catch (error) {
        showMessage(error.message, true);
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
            throw new Error(data.error || "Could not load transactions.");
        }

        const transactions = data.transactions || [];

        document.getElementById("transaction-count").textContent =
            transactions.length;

        transactionList.replaceChildren();

        if (transactions.length === 0) {
            const emptyMessage = document.createElement("p");
            emptyMessage.className = "history-message";
            emptyMessage.textContent = "You have not made any purchases yet.";
            transactionList.appendChild(emptyMessage);
            return;
        }

        transactions.forEach(transaction => {
            const card = document.createElement("div");
            card.className = "transaction-card";

            const information = document.createElement("div");
            information.className = "transaction-information";

            const title = document.createElement("h3");
            title.textContent = `Transaction #${transaction.transaction_id}`;

            const date = document.createElement("p");
            date.textContent = formatDate(transaction.date);

            const points = document.createElement("p");
            points.textContent = `Points earned: ${transaction.points_earned}`;

            const total = document.createElement("strong");
            total.textContent = formatMoney(transaction.total);

            const detailsButton = document.createElement("button");
            detailsButton.type = "button";
            detailsButton.className = "transaction-details-btn";
            detailsButton.textContent = "View Details";

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
        transactionList.textContent = error.message;
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
            throw new Error(data.error || "Could not load transaction details.");
        }

        const detailsSection = document.getElementById("transaction-details");
        const itemsContainer = document.getElementById("transaction-items");

        itemsContainer.replaceChildren();

        document.getElementById("detail-transaction-date").textContent =
            formatDate(data.transaction.date);

        document.getElementById("detail-total").textContent =
            formatMoney(data.transaction.total);

        document.getElementById("detail-points").textContent =
            `Points earned: ${data.transaction.points_earned}`;

        (data.items || []).forEach(item => {
            const row = document.createElement("div");
            row.className = "transaction-item";

            const name = document.createElement("span");
            name.textContent = `${item.product_name} × ${item.quantity}`;

            const lineTotal = document.createElement("strong");
            lineTotal.textContent = formatMoney(item.line_total);

            row.append(name, lineTotal);
            itemsContainer.appendChild(row);
        });

        detailsSection.hidden = false;
        detailsSection.scrollIntoView({ behavior: "smooth" });

    } catch (error) {
        showMessage(error.message, true);
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
            throw new Error("Could not log out. Please try again.");
        }

        window.location.href = "index.html";

    } catch (error) {
        showMessage(error.message, true);
    }
}


// FORMATTING HELPERS
function formatMoney(value) {
    return new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD"
    }).format(Number(value) || 0);
}


function formatDate(value) {
    if (!value) return "Date unavailable";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString("en-CA", {
        dateStyle: "medium",
        timeStyle: "short"
    });
}