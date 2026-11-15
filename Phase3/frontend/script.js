
const API_URL = "/api";

// Existing cart elements
const cartItems = document.getElementById("cartItems");
const itemCount = document.getElementById("itemCount");
const summaryCount = document.getElementById("summaryCount");
const subtotal = document.getElementById("subtotal");
const cartTotal = document.getElementById("cartTotal");
const clearCartBtn = document.getElementById("clearCartBtn");
const checkoutBtn = document.getElementById("checkoutBtn");
const cartMessage = document.getElementById("cartMessage");

// Cart and checkout state
let busy = false;
let lastCart = null;
let currentCart = null;
let connectionErrorShown = false;

let checkoutStage = "idle";
let orderSnapshot = [];
let selectedCustomer = null;

// --------------------------------------------------
// GENERAL HELPERS
// --------------------------------------------------

function money(value) {
    return "$" + Number(value).toFixed(2);
}

function showMessage(message, error = false) {
    cartMessage.textContent = message;
    cartMessage.classList.toggle("error", error);
}

function createIcon(name) {
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", name);
    return icon;
}

function refreshIcons() {
    if (window.lucide) {
        lucide.createIcons();
    }
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: "same-origin"
    });

    let data = {};

    try {
        data = await response.json();
    } catch {
        // The server did not return JSON.
    }

    if (!response.ok) {
        throw new Error(
            data.message || data.error || "Something went wrong."
        );
    }

    return data;
}

// --------------------------------------------------
// CHECKOUT INTERFACE
// --------------------------------------------------

// Create checkout sections without changing cart.html
const checkoutPanel = document.createElement("section");
checkoutPanel.id = "checkoutPanel";
checkoutPanel.className = "checkout-panel hidden";

const receiptPanel = document.createElement("section");
receiptPanel.id = "receiptPanel";
receiptPanel.className = "receipt-panel hidden";

const checkoutLayout = document.querySelector(".checkout-layout");

checkoutLayout.insertAdjacentElement("afterend", checkoutPanel);
checkoutPanel.insertAdjacentElement("afterend", receiptPanel);

// --------------------------------------------------
// RFID CART DISPLAY
// --------------------------------------------------

// Group identical products for display.
// Keep their individual EPCs so one physical item can be removed.
function groupProducts(items) {
    const groups = new Map();

    for (const item of items) {
        const key = JSON.stringify([item.name, item.price]);

        if (!groups.has(key)) {
            groups.set(key, {
                name: item.name,
                price: item.price,
                epcs: []
            });
        }

        groups.get(key).epcs.push(item.epc);
    }

    return [...groups.values()];
}

// Display the products detected by the RFID reader
function renderCart(data) {
    const items = data.items || [];
    const groups = groupProducts(items);

    itemCount.textContent =
        `${items.length} item${items.length === 1 ? "" : "s"} in your cart`;

    summaryCount.textContent = items.length;
    subtotal.textContent = money(data.total);
    cartTotal.textContent = money(data.total);

    checkoutBtn.disabled =
        items.length === 0 || checkoutStage !== "idle";

    clearCartBtn.disabled =
        items.length === 0 || checkoutStage !== "idle";

    cartItems.replaceChildren();

    if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-cart";

        const heading = document.createElement("h3");
        heading.textContent = "Your cart is empty";

        const paragraph = document.createElement("p");
        paragraph.textContent = "Scan a product to get started.";

        empty.append(
            createIcon("shopping-cart"),
            heading,
            paragraph
        );

        cartItems.appendChild(empty);
    } else {
        for (const product of groups) {
            const row = document.createElement("div");
            row.className = "cart-item";

            const iconBox = document.createElement("div");
            iconBox.className = "product-icon";
            iconBox.appendChild(createIcon("package"));

            const details = document.createElement("div");
            details.className = "product-details";

            const name = document.createElement("h3");
            name.textContent = product.name;

            const quantity = document.createElement("p");
            quantity.textContent =
                `${money(product.price)} each · Qty: ${product.epcs.length}`;

            details.append(name, quantity);

            const price = document.createElement("span");
            price.className = "product-price";
            price.textContent =
                money(product.price * product.epcs.length);

            const remove = document.createElement("button");
            remove.className = "remove-btn";
            remove.title = "Remove one item";
            remove.setAttribute(
                "aria-label",
                `Remove one ${product.name}`
            );

            remove.appendChild(createIcon("minus"));

            remove.disabled = checkoutStage !== "idle";

            remove.addEventListener("click", () => {
                removeProduct(product.epcs[product.epcs.length - 1]);
            });

            row.append(iconBox, details, price, remove);
            cartItems.appendChild(row);
        }
    }

    refreshIcons();
}

// Fetch the latest cart from Flask.
// This is what keeps the page synchronized with the RFID reader.
async function loadCart() {
    if (busy) return;

    try {
        const data = await apiRequest(`${API_URL}/cart`, {
            cache: "no-store"
        });

        currentCart = data;

        const snapshot = JSON.stringify(data);

        if (connectionErrorShown) {
            showMessage("");
            connectionErrorShown = false;
        }

        if (snapshot !== lastCart) {
            renderCart(data);
            lastCart = snapshot;
        }
    } catch (error) {
        if (!connectionErrorShown) {
            showMessage(
                "We're having trouble updating your cart. Please ask for assistance.",
                true
            );

            connectionErrorShown = true;
        }
    }
}

// Remove one physical item using its EPC
async function removeProduct(epc) {
    if (busy || checkoutStage !== "idle") return;

    busy = true;

    try {
        await apiRequest(`${API_URL}/cart/remove`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ epc })
        });

        showMessage("Item removed from your cart.");
        lastCart = null;
    } catch (error) {
        showMessage(error.message, true);
    } finally {
        busy = false;
        await loadCart();
    }
}

// Clear the cart
async function clearCart() {
    if (busy || checkoutStage !== "idle") return;

    const confirmed = confirm(
        "Are you sure you want to remove all items from your cart?"
    );

    if (!confirmed) return;

    busy = true;

    try {
        await apiRequest(`${API_URL}/cart/clear`, {
            method: "POST"
        });

        showMessage("Your cart has been cleared.");
        lastCart = null;
    } catch (error) {
        showMessage(error.message, true);
    } finally {
        busy = false;
        await loadCart();
    }
}

clearCartBtn.addEventListener("click", clearCart);

// --------------------------------------------------
// CHECKOUT STEP 1: MEMBERSHIP OR GUEST
// --------------------------------------------------

function startCheckout() {
    if (!currentCart || !currentCart.items || currentCart.items.length === 0) {
        showMessage("Scan at least one product before checking out.", true);
        return;
    }

    checkoutStage = "membership";
    selectedCustomer = null;

    checkoutPanel.classList.remove("hidden");
    receiptPanel.classList.add("hidden");

    checkoutPanel.innerHTML = `
        <h2>Before You Pay</h2>
        <p class="checkout-description">
            Scan your membership card to earn points, or continue as a guest.
        </p>

        <div class="checkout-options">
            <div class="checkout-option">
                <h3>Member Checkout</h3>
                <p>
                    Enter your membership card UID to associate this purchase
                    with your customer account and earn points.
                </p>

                <input
                    type="text"
                    id="membershipUid"
                    class="checkout-input"
                    placeholder="Enter RFID card UID"
                    autocomplete="off"
                >

                <button
                    type="button"
                    id="scanMembershipBtn"
                    class="checkout-action"
                >
                    Identify Membership
                </button>
            </div>

            <div class="checkout-option">
                <h3>Guest Checkout</h3>
                <p>
                    Continue without a membership account.
                    Guest purchases do not earn membership points.
                </p>

                <button
                    type="button"
                    id="guestCheckoutBtn"
                    class="checkout-action checkout-secondary"
                >
                    Continue as Guest
                </button>
            </div>
        </div>

        <p id="checkoutFeedback" class="checkout-feedback"
           role="status" aria-live="polite"></p>

        <div class="checkout-actions">
            <button
                type="button"
                id="cancelCheckoutBtn"
                class="checkout-action checkout-secondary"
            >
                Back to Cart
            </button>
        </div>
    `;

    document.getElementById("scanMembershipBtn")
        .addEventListener("click", identifyMember);

    document.getElementById("guestCheckoutBtn")
        .addEventListener("click", continueAsGuest);

    document.getElementById("cancelCheckoutBtn")
        .addEventListener("click", cancelCheckout);

    document.getElementById("membershipUid")
        .addEventListener("keydown", event => {
            if (event.key === "Enter") {
                identifyMember();
            }
        });

    checkoutBtn.disabled = true;
    clearCartBtn.disabled = true;

    checkoutPanel.scrollIntoView({ behavior: "smooth" });
}

// Identify a member using their card UID
async function identifyMember() {
    const uidInput = document.getElementById("membershipUid");
    const feedback = document.getElementById("checkoutFeedback");
    const button = document.getElementById("scanMembershipBtn");

    const cardId = uidInput.value.trim();

    if (!cardId) {
        feedback.textContent = "Please enter your membership card UID.";
        feedback.classList.add("error");
        return;
    }

    button.disabled = true;
    feedback.classList.remove("error");
    feedback.textContent = "Checking membership card...";

    try {
        const data = await apiRequest(
            `${API_URL}/customer/card/scan`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ card_id: cardId })
            }
        );

        //selectedCustomer = data.customer || null;
        // Retrieve the recognized customer's profile
        const profile = await apiRequest(`${API_URL}/customer/me`);

        selectedCustomer = profile.customer;

        feedback.textContent = "Membership recognized successfully.";

        showOrderConfirmation("member");
    } catch (error) {
        feedback.textContent =
            error.message || "Membership card could not be recognized.";

        feedback.classList.add("error");
        button.disabled = false;
    }
}

// Explicitly clear the previous customer session for guest checkout
async function continueAsGuest() {
    const feedback = document.getElementById("checkoutFeedback");
    const button = document.getElementById("guestCheckoutBtn");

    button.disabled = true;
    feedback.classList.remove("error");
    feedback.textContent = "Preparing guest checkout...";

    try {
        await apiRequest(`${API_URL}/customer/logout`, {
            method: "POST"
        });

        selectedCustomer = null;
        showOrderConfirmation("guest");
    } catch (error) {
        feedback.textContent =
            "Unable to start guest checkout. Please try again.";

        feedback.classList.add("error");
        button.disabled = false;
    }
}

// --------------------------------------------------
// CHECKOUT STEP 2: ORDER CONFIRMATION
// --------------------------------------------------

function showOrderConfirmation(customerType) {
    if (!currentCart || !currentCart.items.length) {
        showMessage("Your cart is empty.", true);
        cancelCheckout();
        return;
    }

    // Freeze the cart contents for this order.
    // New RFID scans after this point will not be included.
    orderSnapshot = currentCart.items.map(item => ({ ...item }));

    const total = Number(currentCart.total);

    checkoutStage = "confirmation";

    const itemCountForOrder = orderSnapshot.length;

    checkoutPanel.innerHTML = `
        <h2>Confirm Your Order</h2>

        <p class="checkout-description">
            Please review your order before proceeding to simulated payment.
        </p>

        <div class="checkout-summary">
            <p>
                <span>Customer type</span>
                <strong>${customerType === "member" ? "Member" : "Guest"}</strong>
            </p>

            <p>
                <span>Number of items</span>
                <strong>${itemCountForOrder}</strong>
            </p>

            <p class="checkout-total">
                <span>Total</span>
                <strong>${money(total)}</strong>
            </p>
        </div>

        <p class="checkout-description">
            ${customerType === "member"
                ? "Your purchase will be associated with your membership account."
                : "This purchase will not be associated with a membership account."}
        </p>

        <div class="checkout-actions">
            <button
                type="button"
                id="backToMembershipBtn"
                class="checkout-action checkout-secondary"
            >
                Back
            </button>

            <button
                type="button"
                id="proceedPaymentBtn"
                class="checkout-action"
            >
                Continue to Payment
            </button>
        </div>
    `;

    document.getElementById("backToMembershipBtn")
        .addEventListener("click", startCheckout);

    document.getElementById("proceedPaymentBtn")
        .addEventListener("click", showPaymentStep);

    checkoutPanel.scrollIntoView({ behavior: "smooth" });
}

// --------------------------------------------------
// CHECKOUT STEP 3: SIMULATED PAYMENT
// --------------------------------------------------

function showPaymentStep() {
    checkoutStage = "payment";

    const total = orderSnapshot.reduce(
        (sum, item) => sum + Number(item.price),
        0
    );

    checkoutPanel.innerHTML = `
        <h2>Payment</h2>

        <p class="checkout-description">
            This is a simulated payment for the SmartStore project.
            No real payment or bank transaction will take place.
        </p>

        <div class="checkout-summary">
            <p>
                <span>Payment method</span>
                <strong>Simulated payment</strong>
            </p>

            <p class="checkout-total">
                <span>Amount to pay</span>
                <strong>${money(total)}</strong>
            </p>
        </div>

        <p id="paymentFeedback" class="checkout-feedback"
           role="status" aria-live="polite"></p>

        <div class="checkout-actions">
            <button
                type="button"
                id="backToOrderBtn"
                class="checkout-action checkout-secondary"
            >
                Back to Order
            </button>

            <button
                type="button"
                id="confirmPaymentBtn"
                class="checkout-action"
            >
                Confirm Simulated Payment
            </button>
        </div>
    `;

    document.getElementById("backToOrderBtn")
        .addEventListener("click", () => {
            showOrderConfirmation(
                selectedCustomer ? "member" : "guest"
            );
        });

    document.getElementById("confirmPaymentBtn")
        .addEventListener("click", completeCheckout);

    checkoutPanel.scrollIntoView({ behavior: "smooth" });
}

// --------------------------------------------------
// CHECKOUT STEP 4: RECORD SALE
// --------------------------------------------------

async function completeCheckout() {
    if (busy || orderSnapshot.length === 0) return;

    busy = true;

    const button = document.getElementById("confirmPaymentBtn");
    const feedback = document.getElementById("paymentFeedback");

    button.disabled = true;
    feedback.textContent = "Recording your purchase...";

    try {
        // Aggregate physical items by product_id.
        // The backend expects product_id and quantity.
        const groupedItems = new Map();

        for (const item of orderSnapshot) {
            const productId = Number(item.product_id);

            if (!productId) {
                throw new Error(
                    "A scanned product is missing its product ID."
                );
            }

            groupedItems.set(
                productId,
                (groupedItems.get(productId) || 0) + 1
            );
        }

        const items = [...groupedItems.entries()].map(
            ([product_id, quantity]) => ({
                product_id,
                quantity
            })
        );

        // Record the sale in the backend.
        const sale = await apiRequest(`${API_URL}/sales/checkout`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ items })
        });

        // The sale has been recorded successfully.
        // Now reset the RFID cart for the next customer.
        let cartCleared = true;

        try {
            await apiRequest(`${API_URL}/cart/clear`, {
                method: "POST"
            });
        } catch (error) {
            cartCleared = false;
        }

        lastCart = null;
        currentCart = null;

        checkoutStage = "receipt";

        showReceipt(sale, orderSnapshot, cartCleared);

    } catch (error) {
        feedback.textContent =
            error.message || "Unable to complete your purchase.";

        feedback.classList.add("error");
        button.disabled = false;

    } finally {
        busy = false;
        await loadCart();
    }
}

// --------------------------------------------------
// CHECKOUT STEP 5: RECEIPT
// --------------------------------------------------

function showReceipt(sale, purchasedItems, cartCleared) {
    checkoutPanel.classList.add("hidden");
    receiptPanel.classList.remove("hidden");

    const groupedProducts = groupProducts(purchasedItems);

    receiptPanel.replaceChildren();

    const success = document.createElement("div");
    success.className = "receipt-success";

    success.appendChild(createIcon("circle-check"));

    const heading = document.createElement("h2");
    heading.textContent = "Purchase Successful!";

    const message = document.createElement("p");
    message.textContent =
        "Your SmartStore transaction has been recorded.";

    success.append(heading, message);

    const details = document.createElement("div");
    details.className = "receipt-details";

    const transaction = document.createElement("p");
    transaction.textContent =
        `Transaction #${sale.transaction_id}`;

    const date = document.createElement("p");
    date.textContent =
        `Date: ${new Date(sale.date).toLocaleString()}`;

    // const customer = document.createElement("p");
    // customer.textContent =
    //     `Customer: ${sale.guest_checkout ? "Guest" : "Member"}`;

    // const points = document.createElement("p");
    // points.textContent =
    //     `Points earned: ${sale.points_earned}`;

    // details.append(transaction, date, customer, points);

    const customer = document.createElement("p");

    customer.textContent = sale.guest_checkout
      ? "Customer: Guest"
      : `Customer: ${selectedCustomer?.name || "Member"}`;

    details.append(transaction, date, customer);

    // Display membership number for registered customers
    if (!sale.guest_checkout && selectedCustomer) {
      const membership = document.createElement("p");

      membership.textContent = `Membership: ${selectedCustomer.membership_number}`;

      details.appendChild(membership);
    }

    const points = document.createElement("p");
    points.textContent = `Points earned: ${sale.points_earned}`;

    details.appendChild(points);

    const itemsSection = document.createElement("div");
    itemsSection.className = "receipt-items";

    const itemsHeading = document.createElement("h3");
    itemsHeading.textContent = "Purchased Products";
    itemsSection.appendChild(itemsHeading);

    for (const product of groupedProducts) {
        const row = document.createElement("div");
        row.className = "receipt-item";

        const description = document.createElement("span");
        description.textContent =
            `${product.name} × ${product.epcs.length}`;

        const price = document.createElement("strong");
        price.textContent =
            money(product.price * product.epcs.length);

        row.append(description, price);
        itemsSection.appendChild(row);
    }

    const total = document.createElement("p");
    total.className = "receipt-total";
    total.textContent = `Total paid: ${money(sale.total)}`;

    const note = document.createElement("p");
    note.className = "checkout-feedback";
    note.textContent = "Payment was simulated; no real payment was processed.";

    const nextButton = document.createElement("button");
    nextButton.className = "checkout-action";
    nextButton.textContent = "Start New Shopping Session";
    nextButton.addEventListener("click", resetCheckout);

    receiptPanel.append(
        success,
        details,
        itemsSection,
        total,
        note,
        nextButton
    );

    if (!cartCleared) {
        const warning = document.createElement("p");
        warning.className = "checkout-feedback error";
        warning.textContent =
            "Your sale was recorded, but the RFID cart could not be cleared. Please ask for assistance before the next customer.";

        receiptPanel.insertBefore(warning, nextButton);
    }

    refreshIcons();
    receiptPanel.scrollIntoView({ behavior: "smooth" });

    showMessage("Sale recorded successfully.");
}

// --------------------------------------------------
// CANCEL OR RESET CHECKOUT
// --------------------------------------------------

function cancelCheckout() {
    checkoutStage = "idle";
    selectedCustomer = null;
    orderSnapshot = [];

    checkoutPanel.classList.add("hidden");

    if (currentCart) {
        renderCart(currentCart);
    }

    showMessage("Checkout cancelled. Your scanned items remain in the cart.");
}

function resetCheckout() {
    checkoutStage = "idle";
    selectedCustomer = null;
    orderSnapshot = [];

    checkoutPanel.classList.add("hidden");
    receiptPanel.classList.add("hidden");

    showMessage("Ready for the next customer.");

    lastCart = null;
    loadCart();
}

// --------------------------------------------------
// BUTTONS AND INITIALIZATION
// --------------------------------------------------

checkoutBtn.addEventListener("click", startCheckout);

// First cart load
loadCart();

// Keep the page synchronized with the RFID reader
setInterval(loadCart, 1000);

refreshIcons();
