
const API_URL = "/api";

// Shared language helpers (i18n.js). Text set through these keeps its key,
// so it switches language by itself when the visitor toggles EN/FR.
const { t, setText, setRaw, setMoney, setAttr, makeError, fromResponse, showError } = SmartStore;

// Existing cart elements
const cartItems = document.getElementById("cartItems");
const itemCount = document.getElementById("itemCount");
const summaryCount = document.getElementById("summaryCount");
const subtotal = document.getElementById("subtotal");
const cartTotal = document.getElementById("cartTotal");
const cartGst = document.getElementById("cartGst");
const cartQst = document.getElementById("cartQst");
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

// True when checkout skipped the membership step because the customer was already logged in
let skippedMembershipStep = false;

// --------------------------------------------------
// GENERAL HELPERS
// --------------------------------------------------

const money = SmartStore.money;

// Show a message (a translation key) under the cart.
function showMessage(key, error = false, vars) {
    setText(cartMessage, key, vars);
    cartMessage.classList.toggle("error", error);
    SmartStore.notify(key, vars, error);
}

// Show an error (translated when possible) under the cart.
function showFailure(error) {
    showError(cartMessage, error);
    cartMessage.classList.add("error");
    SmartStore.showToast(cartMessage.textContent, true);
}

function clearMessage() {
    setRaw(cartMessage, "");
    cartMessage.classList.remove("error");
}

// Set a status line inside a checkout panel.
function setFeedback(element, key, error = false) {
    setText(element, key);
    element.classList.toggle("error", error);
    if (error) SmartStore.notify(key, undefined, true);
}

function setFeedbackError(element, err) {
    showError(element, err);
    element.classList.add("error");
    SmartStore.showToast(element.textContent, true);
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

async function apiRequest(url, options = {}, fallbackKey) {
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
        throw fromResponse(data, fallbackKey || "err_generic");
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

// Fill a checkout panel from a template that uses data-i18n attributes.
function setPanel(html) {
    checkoutPanel.innerHTML = html;
    SmartStore.apply(checkoutPanel);
}

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

    setText(itemCount, "items_in_cart", { n: items.length });

    summaryCount.textContent = items.length;
    setMoney(subtotal, data.subtotal);
    setMoney(cartGst, data.gst);
    setMoney(cartQst, data.qst);
    setMoney(cartTotal, data.total);

    checkoutBtn.disabled =
        items.length === 0 || checkoutStage !== "idle";

    clearCartBtn.disabled =
        items.length === 0 || checkoutStage !== "idle";

    cartItems.replaceChildren();

    if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-cart";

        const heading = document.createElement("h3");
        setText(heading, "cart_empty_h");

        const paragraph = document.createElement("p");
        setText(paragraph, "cart_empty_p");

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
            setText(quantity, "each_qty", {
                price: product.price,
                n: product.epcs.length
            });

            details.append(name, quantity);
            
            const price = document.createElement("span");
            price.className = "product-price";
            setMoney(price, product.price * product.epcs.length);

            const remove = document.createElement("button");
            remove.className = "remove-btn";
            setAttr(remove, "title", "remove_one");
            setAttr(remove, "aria-label", "remove_one_named", { name: product.name });

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

        const previousCart = currentCart;
        const shouldNotifyAdditions = lastCart !== null && checkoutStage === "idle";
        currentCart = data;

        const snapshot = JSON.stringify(data);

        if (connectionErrorShown) {
            clearMessage();
            connectionErrorShown = false;
        }

        if (snapshot !== lastCart) {
            if (shouldNotifyAdditions && previousCart) {
                const previousEpcs = new Set((previousCart.items || []).map(item => item.epc));
                const addedCount = (data.items || []).filter(item => !previousEpcs.has(item.epc)).length;
                if (addedCount > 0) {
                    SmartStore.notify("msg_cart_added", { n: addedCount });
                }
            }
            renderCart(data);
            lastCart = snapshot;
        }
    } catch (error) {
        if (!connectionErrorShown) {
            showMessage("err_cart_trouble", true);

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

        showMessage("msg_removed");
        lastCart = null;
    } catch (error) {
        showFailure(error);
    } finally {
        busy = false;
        await loadCart();
    }
}

// Clear the cart
async function clearCart() {
    if (busy || checkoutStage !== "idle") return;

    const confirmed = confirm(t("confirm_clear"));

    if (!confirmed) return;

    busy = true;

    try {
        await apiRequest(`${API_URL}/cart/clear`, {
            method: "POST"
        });

        showMessage("msg_cleared");
        lastCart = null;
    } catch (error) {
        showFailure(error);
    } finally {
        busy = false;
        await loadCart();
    }
}

clearCartBtn.addEventListener("click", clearCart);

// --------------------------------------------------
// CHECKOUT STEP 1: MEMBERSHIP OR GUEST
// --------------------------------------------------

async function startCheckout() {
    if (!currentCart || !currentCart.items || currentCart.items.length === 0) {
        showMessage("msg_scan_first", true);
        return;
    }

    // Prevent a double click from starting checkout twice
    checkoutBtn.disabled = true;
    clearCartBtn.disabled = true;

    // Already logged in (email + password, or membership card)?
    // The sale is linked to the logged-in account, so skip the membership step.
    const customer = await getLoggedInCustomer();
    skippedMembershipStep = Boolean(customer);

    if (customer) {
        selectedCustomer = customer;

        checkoutPanel.classList.remove("hidden");
        receiptPanel.classList.add("hidden");

        showOrderConfirmation("member");
        checkoutPanel.scrollIntoView({ behavior: "smooth" });
        return;
    }

    checkoutStage = "membership";
    selectedCustomer = null;

    checkoutPanel.classList.remove("hidden");
    receiptPanel.classList.add("hidden");

    setPanel(`
        <h2 data-i18n="co_before_pay"></h2>
        <p class="checkout-description" data-i18n="co_before_desc"></p>

        <div class="checkout-options">
            <div class="checkout-option">
                <h3 data-i18n="co_member_h"></h3>
                <p data-i18n="co_member_p"></p>

                <input
                    type="text"
                    id="membershipUid"
                    class="checkout-input"
                    data-i18n-placeholder="co_uid_ph"
                    autocomplete="off"
                >

                <button
                    type="button"
                    id="scanMembershipBtn"
                    class="checkout-action"
                    data-i18n="co_identify"
                ></button>
            </div>

            <div class="checkout-option">
                <h3 data-i18n="co_guest_h"></h3>
                <p data-i18n="co_guest_p"></p>

                <button
                    type="button"
                    id="guestCheckoutBtn"
                    class="checkout-action checkout-secondary"
                    data-i18n="co_guest_btn"
                ></button>
            </div>
        </div>

        <p id="checkoutFeedback" class="checkout-feedback"
           role="status" aria-live="polite"></p>

        <div class="checkout-actions">
            <button
                type="button"
                id="cancelCheckoutBtn"
                class="checkout-action checkout-secondary"
                data-i18n="co_back_cart"
            ></button>
        </div>
    `);
    
    
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

    // Listen for a card tapped on the ESP32 reader
    watchMembershipCard();

    checkoutPanel.scrollIntoView({ behavior: "smooth" });
}

// The customer who is logged in on this browser (email + password, or membership card).
// Returns null for nobody, or for an admin (admins aren't shoppers).
async function getLoggedInCustomer() {
    try {
        const response = await fetch(`${API_URL}/customer/me`, { credentials: "same-origin" });

        if (!response.ok) {
            return null;
        }

        const customer = (await response.json()).customer;
        return customer && customer.role !== 1 ? customer : null;
    } catch (error) {
        return null;
    }
}

// When a card is tapped on the ESP32 reader (MQTT), fill in the UID and identify the member
let cardWatcher = null;

async function watchMembershipCard() {
    clearInterval(cardWatcher);

    // Ignore cards that were tapped before this checkout started
    let lastScanId;

    try {
        const card = await apiRequest(`${API_URL}/membership/last-card`);
        lastScanId = card.scan_id;
    } catch (error) {
        return; // the UID can still be typed in by hand
    }

    cardWatcher = setInterval(async () => {
        // Stop listening once the customer leaves the membership step
        if (checkoutStage !== "membership") {
            clearInterval(cardWatcher);
            return;
        }

        try {
            const card = await apiRequest(`${API_URL}/membership/last-card`);

            if (card.uid && card.scan_id !== lastScanId) {
                lastScanId = card.scan_id;
                document.getElementById("membershipUid").value = card.uid;
                identifyMember();
            }
        } catch (error) {
            // Try again on the next second
        }
    }, 1000);
}

// Identify a member using their card UID
async function identifyMember() {
    const uidInput = document.getElementById("membershipUid");
    const feedback = document.getElementById("checkoutFeedback");
    const button = document.getElementById("scanMembershipBtn");

    const cardId = uidInput.value.trim();

    if (!cardId) {
        setFeedback(feedback, "co_enter_uid", true);
        return;
    }

    button.disabled = true;
    setFeedback(feedback, "co_checking");

    try {
        await apiRequest(
            `${API_URL}/customer/card/scan`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ card_id: cardId })
            },
            "co_not_recognized"
        );

        // Retrieve the recognized customer's profile
        const profile = await apiRequest(`${API_URL}/customer/me`);

        selectedCustomer = profile.customer;

        setFeedback(feedback, "co_recognized");
        SmartStore.notify("co_recognized");
        SmartStore.refreshSession?.();   // greet the recognized member

        showOrderConfirmation("member");
    } catch (error) {
        setFeedbackError(feedback, error);
        button.disabled = false;
    }
}

// Explicitly clear the previous customer session for guest checkout
async function continueAsGuest() {
    const feedback = document.getElementById("checkoutFeedback");
    const button = document.getElementById("guestCheckoutBtn");

    button.disabled = true;
    setFeedback(feedback, "co_preparing_guest");

    try {
        await apiRequest(`${API_URL}/customer/logout`, {
            method: "POST"
        });

        selectedCustomer = null;
        SmartStore.refreshSession?.();   // the session was logged out
        SmartStore.notify("co_guest_ready");
        showOrderConfirmation("guest");
    } catch (error) {
        setFeedback(feedback, "co_guest_fail", true);
        button.disabled = false;
    }
}

// --------------------------------------------------
// CHECKOUT STEP 2: ORDER CONFIRMATION
// --------------------------------------------------

function showOrderConfirmation(customerType) {
    if (!currentCart || !currentCart.items.length) {
        showMessage("cart_empty_h", true);
        cancelCheckout();
        return;
    }

    // Freeze the cart contents for this order.
    // New RFID scans after this point will not be included.
    orderSnapshot = currentCart.items.map(item => ({ ...item }));

    const subtotalAmount = Number(currentCart.subtotal);
    const gst = Number(currentCart.gst);
    const qst = Number(currentCart.qst);
    const total = Number(currentCart.total);

    checkoutStage = "confirmation";

    const itemCountForOrder = orderSnapshot.length;
    const isMember = customerType === "member";

    setPanel(`
        <h2 data-i18n="co_confirm_h"></h2>

        <p class="checkout-description" data-i18n="co_confirm_desc"></p>

        <div class="checkout-summary">
            <p>
                <span data-i18n="co_customer_type"></span>
                <strong data-i18n="${isMember ? "co_member" : "co_guest"}"></strong>
            </p>

            <p>
                <span data-i18n="co_num_items"></span>
                <strong>${itemCountForOrder}</strong>
            </p>

            <p>Subtotal: <strong data-money="${subtotalAmount}"></strong></p>
            <p>GST (5%): <strong data-money="${gst}"></strong></p>
            <p>QST (9.975%): <strong data-money="${qst}"></strong></p>
            <p class="checkout-total">
                <span data-i18n="total"></span>
                <strong data-money="${total}"></strong>
            </p>
            
            
        </div>

        <p class="checkout-description"
           data-i18n="${isMember ? "co_member_note" : "co_guest_note"}"></p>

        <div class="checkout-actions">
            <button
                type="button"
                id="backToMembershipBtn"
                class="checkout-action checkout-secondary"
                data-i18n="co_back"
            ></button>

            <button
                type="button"
                id="proceedPaymentBtn"
                class="checkout-action"
                data-i18n="co_continue_pay"
            ></button>
        </div>
    `);

    // Back: to the membership step, or to the cart if that step was skipped (already logged in)
    document.getElementById("backToMembershipBtn")
        .addEventListener("click", () => {
            if (skippedMembershipStep) {
                cancelCheckout();
            } else {
                startCheckout();
            }
        });

    document.getElementById("proceedPaymentBtn")
        .addEventListener("click", showPaymentStep);

    checkoutPanel.scrollIntoView({ behavior: "smooth" });
}

// --------------------------------------------------
// CHECKOUT STEP 3: SIMULATED PAYMENT
// --------------------------------------------------

function showPaymentStep() {
    checkoutStage = "payment";

    const subtotalCents = orderSnapshot.reduce(
        (sum, item) => sum + Math.round(Number(item.price) * 100),
        0
    );
    const subtotalAmount = subtotalCents / 100;
    const gst = Math.round(subtotalCents * 0.05) / 100;
    const qst = Math.round(subtotalCents * 0.09975) / 100;
    const total = subtotalAmount + gst + qst;

    setPanel(`
        <h2 data-i18n="pay_h"></h2>

        <p class="checkout-description" data-i18n="pay_desc"></p>

        <div class="checkout-summary">
            <p>
                <span data-i18n="pay_method"></span>
                <strong data-i18n="pay_simulated"></strong>
            </p>

            <p>Subtotal: <strong data-money="${subtotalAmount}"></strong></p>
            <p>GST (5%): <strong data-money="${gst}"></strong></p>
            <p>QST (9.975%): <strong data-money="${qst}"></strong></p>
            <p class="checkout-total">
                <span data-i18n="pay_amount"></span>
                <strong data-money="${total}"></strong>
            </p>
        </div>

        <p id="paymentFeedback" class="checkout-feedback"
           role="status" aria-live="polite"></p>

        <div class="checkout-actions">
            <button
                type="button"
                id="backToOrderBtn"
                class="checkout-action checkout-secondary"
                data-i18n="pay_back"
            ></button>

            <button
                type="button"
                id="confirmPaymentBtn"
                class="checkout-action"
                data-i18n="pay_confirm"
            ></button>
        </div>
    `);

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
    setFeedback(feedback, "pay_recording");

    try {
        // Aggregate physical items by product_id.
        // The backend expects product_id and quantity.
        const groupedItems = new Map();

        for (const item of orderSnapshot) {
            const productId = Number(item.product_id);

            if (!productId) {
                throw makeError("err_missing_product_id");
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
        }, "err_purchase_failed");

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
        setFeedbackError(feedback, error);
        button.disabled = false;

    } finally {
        busy = false;
        await loadCart();
    }
}

// --------------------------------------------------
// CHECKOUT STEP 5: RECEIPT
// --------------------------------------------------

// Create an element whose text is a translation key.
function textElement(tag, key, vars, className) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    setText(element, key, vars);
    return element;
}


function showReceipt(sale, purchasedItems, cartCleared) {
    checkoutPanel.classList.add("hidden");
    receiptPanel.classList.remove("hidden");

    const groupedProducts = groupProducts(purchasedItems);

    receiptPanel.replaceChildren();

    const success = document.createElement("div");
    success.className = "receipt-success";

    success.append(
        createIcon("circle-check"),
        textElement("h2", "rc_success"),
        textElement("p", "rc_recorded")
    );

    const details = document.createElement("div");
    details.className = "receipt-details";

    details.append(
        textElement("p", "tx_title", { id: sale.transaction_id }),
        textElement("p", "rc_date", { date: sale.date })
    );

    if (sale.guest_checkout) {
        details.appendChild(textElement("p", "rc_customer_guest"));
    } else {
        details.appendChild(textElement("p", "rc_customer_member", {
            name: selectedCustomer?.name || t("co_member")
        }));

        // Display membership number for registered customers
        if (selectedCustomer) {
            details.appendChild(textElement("p", "rc_membership", {
                num: selectedCustomer.membership_number
            }));
        }
    }

    details.appendChild(textElement("p", "points_earned", { n: sale.points_earned }));

    // Receipt email (members only)
    if (!sale.guest_checkout) {
        if (!sale.email_sent) {
            details.appendChild(textElement("p", "rc_email_failed"));
        } else if (selectedCustomer?.email) {
            details.appendChild(textElement("p", "rc_emailed", { email: selectedCustomer.email }));
        } else {
            details.appendChild(textElement("p", "rc_emailed_generic"));
        }
    }

    const itemsSection = document.createElement("div");
    itemsSection.className = "receipt-items";
    itemsSection.appendChild(textElement("h3", "rc_items_h"));

    for (const product of groupedProducts) {
        const row = document.createElement("div");
        row.className = "receipt-item";

        const description = document.createElement("span");
        description.textContent = `${product.name} × ${product.epcs.length}`;

        const price = document.createElement("strong");
        setMoney(price, product.price * product.epcs.length);

        row.append(description, price);
        itemsSection.appendChild(row);
    }

    const taxes = document.createElement("div");
    taxes.className = "receipt-details";

    for (const [label, amount] of [
        ["Subtotal", sale.subtotal],
        ["GST (5%)", sale.gst],
        ["QST (9.975%)", sale.qst]
    ]) {
        const line = document.createElement("p");
        const value = document.createElement("strong");

        line.append(`${label}: `, value);
        setMoney(value, amount);

        taxes.appendChild(line);
    }

    const total = textElement("p", "rc_total_paid", { amount: sale.total }, "receipt-total");
    const note = textElement("p", "rc_simulated_note", null, "checkout-feedback");
    const nextButton = textElement("button", "rc_new_session", null, "checkout-action");

    nextButton.addEventListener("click", resetCheckout);

    receiptPanel.append(
        success,
        details,
        itemsSection,
        taxes,
        total,
        note,
        nextButton
    );

    if (!cartCleared) {
        receiptPanel.insertBefore(
            textElement("p", "rc_cart_not_cleared", null, "checkout-feedback error"),
            nextButton
        );
    }

    refreshIcons();
    receiptPanel.scrollIntoView({ behavior: "smooth" });

    showMessage("msg_sale_recorded");
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

    showMessage("msg_checkout_cancelled");
}

async function resetCheckout() {
    try {
        await apiRequest(`${API_URL}/cart/new`, {
            method: "POST"
        });
    } catch (e) {}

    // Log out the member whose card was scanned, so the next customer
    // can't see their account on the kiosk
    try {
        await apiRequest(`${API_URL}/customer/logout`, {
            method: "POST"
        });
    } catch (e) {}

    checkoutStage = "idle";
    selectedCustomer = null;
    orderSnapshot = [];

    checkoutPanel.classList.add("hidden");
    receiptPanel.classList.add("hidden");

    showMessage("msg_ready_next");
    SmartStore.refreshSession?.();

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


            
            


            
            
