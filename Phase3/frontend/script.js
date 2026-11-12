
const API_URL = "";

// HTML elements
const cartItems = document.getElementById("cartItems");
const itemCount = document.getElementById("itemCount");
const summaryCount = document.getElementById("summaryCount");
const subtotal = document.getElementById("subtotal");
const cartTotal = document.getElementById("cartTotal");
const clearCartBtn = document.getElementById("clearCartBtn");
const checkoutBtn = document.getElementById("checkoutBtn");
const cartMessage = document.getElementById("cartMessage");

let busy = false;
let lastCart = null;
let connectionErrorShown = false;

// Format prices
function money(value) {
    return "$" + Number(value).toFixed(2);
}

// Display customer-friendly messages
function showMessage(message, error = false) {
    cartMessage.textContent = message;
    cartMessage.classList.toggle("error", error);
}

// Group identical products by name and price
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

// Create an icon
function createIcon(name) {
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", name);
    return icon;
}

// Display cart contents
function renderCart(data) {
    const items = data.items || [];
    const groups = groupProducts(items);

    itemCount.textContent =
        `${items.length} item${items.length === 1 ? "" : "s"} in your cart`;

    summaryCount.textContent = items.length;
    subtotal.textContent = money(data.total);
    cartTotal.textContent = money(data.total);

    checkoutBtn.disabled = items.length === 0;
    clearCartBtn.disabled = items.length === 0;

    cartItems.replaceChildren();

    // Empty cart
    if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-cart";

        const icon = createIcon("shopping-cart");

        const heading = document.createElement("h3");
        heading.textContent = "Your cart is empty";

        const paragraph = document.createElement("p");
        paragraph.textContent =
            "Your items will appear here automatically.";

        empty.append(icon, heading, paragraph);
        cartItems.appendChild(empty);
    } else {
        // Display grouped products
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

            // Remove one physical item
            const remove = document.createElement("button");
            remove.className = "remove-btn";
            remove.title = "Remove one item";
            remove.setAttribute(
                "aria-label",
                `Remove one ${product.name}`
            );

            remove.appendChild(createIcon("minus"));

            remove.addEventListener("click", () => {
                removeProduct(product.epcs[product.epcs.length - 1]);
            });

            row.append(iconBox, details, price, remove);
            cartItems.appendChild(row);
        }
    }

    if (window.lucide) {
        lucide.createIcons();
    }
}

// Fetch cart from SmartStore
async function loadCart() {
    if (busy) return;

    try {
        const response = await fetch(`${API_URL}/cart`, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("Cart unavailable");
        }

        const data = await response.json();
        const snapshot = JSON.stringify(data);

        // Clear previous connection error
        if (connectionErrorShown) {
            showMessage("");
            connectionErrorShown = false;
        }

        // Only update when cart changes
        if (snapshot !== lastCart) {
            renderCart(data);
            lastCart = snapshot;
        }
    } catch (error) {
        // Show a friendly message without technical details
        if (!connectionErrorShown) {
            showMessage(
                "We're having trouble updating your cart. Please ask for assistance.",
                true
            );
            connectionErrorShown = true;
        }
    }
}

// Remove one product from cart
async function removeProduct(epc) {
    if (busy) return;

    busy = true;

    try {
        const response = await fetch(`${API_URL}/cart/remove`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ epc })
        });

        if (!response.ok) {
            throw new Error("Unable to remove item");
        }

        showMessage("Item removed from your cart.");
        lastCart = null;
    } catch (error) {
        showMessage(
            "We couldn't remove that item. Please try again.",
            true
        );
    } finally {
        busy = false;
        await loadCart();
    }
}

// Clear entire cart
async function clearCart() {
    if (busy) return;

    const confirmed = confirm(
        "Are you sure you want to remove all items from your cart?"
    );

    if (!confirmed) return;

    busy = true;

    try {
        const response = await fetch(`${API_URL}/cart/clear`, {
            method: "POST"
        });

        if (!response.ok) {
            throw new Error("Unable to clear cart");
        }

        showMessage("Your cart has been cleared.");
        lastCart = null;
    } catch (error) {
        showMessage(
            "We couldn't clear your cart. Please try again.",
            true
        );
    } finally {
        busy = false;
        await loadCart();
    }
}

// Clear cart button
clearCartBtn.addEventListener("click", clearCart);

// Checkout button (teammate will connect payment)
checkoutBtn.addEventListener("click", () => {
    showMessage(
        "Checkout will be available soon."
    );
});

// Initial cart load
loadCart();

// Automatically refresh cart every second
setInterval(loadCart, 1000);
