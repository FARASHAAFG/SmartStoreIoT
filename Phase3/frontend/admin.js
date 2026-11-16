/* SmartStore — product & inventory management page (admin only). */

const API = "/api";

/* ---------- translations (English / French) ---------- */

const I18N = {
  en: {
    title_admin: "SmartStore | Inventory", summary_label: "Summary",
    btn_card: "Link membership card", card_title: "Link a membership card",
    card_find: "Find the customer", card_search_ph: "Name, email or membership number",
    card_col_email: "Email", card_col_member: "Membership", card_col_card: "Card",
    card_none: "None", card_select: "Select", card_empty: "No customers yet.",
    card_empty_search: "No customer matches your search.",
    card_pick_prompt: "Select a customer above.",
    card_picked_new: "{name} ({num}) — no card linked yet",
    card_picked_replace: "{name} ({num}) — currently linked to {card}. Saving replaces that card.",
    card_uid: "Card UID", card_uid_ph: "e.g. A5 C7 4D 06",
    card_uid_hint: "Tap the card on the reader and the UID fills in, or type it (hex digits).",
    card_read: "Card read: {uid}", ok_card_linked: "Card linked to {name}.",
    err_no_customer: "Select a customer first.",
    err_invalid_card_uid: "Card UID must be 1 to 32 hex digits (0–9, A–F).",
    err_customer_not_found: "Customer account not found.",
    err_card_taken: "This card is already assigned to another account.",
    title: "Inventory Management", subtitle: "Products, tags and stock for the store.",
    nav_home: "Home", nav_account: "My Account",
    stat_products: "Products", stat_units: "Units in stock", stat_low: "Low stock",
    stat_out: "Out of stock", stat_value: "Stock value",
    search_ph: "Search name, category, UPC…",
    btn_add: "Add product", btn_receive: "Receive stock",
    col_name: "Name", col_category: "Category", col_producer: "Producer", col_upc: "UPC",
    col_price: "Price", col_stock: "Stock", col_last: "Last received", col_actions: "Actions",
    act_receive: "Receive", act_history: "History", act_edit: "Edit", act_delete: "Delete",
    badge_low: "Low", badge_out: "Out",
    empty: "No products yet. Add your first product.",
    empty_search: "No product matches your search.",
    form_add_title: "Add product", form_edit_title: "Edit product",
    f_name: "Name", f_category: "Category", f_producer: "Producer company", f_price: "Price",
    f_upc: "UPC (barcode)", f_upc_hint: "Scan the barcode or type up to 13 digits.",
    f_date: "Date received",
    tags_title: "RFID tags (EPC)",
    tags_hint: "Each physical item has its own tag. The number of tags is the quantity received.",
    tag_input_ph: "Type or paste an EPC, press Enter",
    btn_tag_add: "Add", btn_scan_rfid: "Scan RFID",
    rfid_none: "No new tags detected yet. Place the tags on the reader.",
    rfid_found: "{n} new tag(s) detected", btn_add_all: "Add all",
    qty: "Quantity: {n}",
    btn_save: "Save", btn_cancel: "Cancel", btn_close: "Close",
    receive_title: "Receive stock", receive_scan: "Scan or type the product UPC",
    receive_none: "No product selected.", receive_current: "{name} — current stock: {n}",
    history_title: "Reception history", h_date: "Date", h_qty: "Quantity", h_note: "Note",
    history_empty: "No receptions recorded.",
    note_initial: "Initial stock", note_opening: "Opening stock",
    delete_title: "Delete product?", delete_text: "“{name}” will be permanently removed.",
    ok_added: "Product added successfully.", ok_updated: "Product updated successfully.",
    ok_deleted: "Product deleted successfully.", ok_received: "{n} unit(s) of {name} received.",
    admin_denied: "This page is for administrators only.", go_login: "Log in",
    err_login_required: "Please log in first.",
    err_admin_required: "Administrator access required.",
    err_invalid_name: "Product name is required (max 100 characters).",
    err_invalid_category: "Category is required.",
    err_invalid_producer: "Producer company is required.",
    err_invalid_upc: "UPC must be 1 to 13 digits.",
    err_invalid_price: "Price must be a number between 0 and 100000.",
    err_epc_required: "Add at least one EPC tag.",
    err_too_many_epcs: "At most 500 tags per reception.",
    err_invalid_epc: "Invalid EPC: {x} (hex characters only, max 24).",
    err_duplicate_epc: "EPC listed twice: {x}.",
    err_invalid_date: "Date must be valid.",
    err_future_date: "Reception date cannot be in the future.",
    err_upc_taken: "This UPC already belongs to another product.",
    err_epc_taken: "EPC already assigned: {x}.",
    err_product_not_found: "Product not found.",
    err_has_sales: "This product appears in past purchases and cannot be deleted.",
    err_server_error: "Something went wrong on the server.",
    err_network: "Cannot reach the server.",
    err_tag_format: "EPC must be hex characters only (max 24).",
    err_tag_listed: "This EPC is already in the list.",
    err_no_product: "Select a product first (scan its UPC).",
  },
  fr: {
    title_admin: "SmartStore | Stocks", summary_label: "Résumé",
    btn_card: "Associer une carte de membre", card_title: "Associer une carte de membre",
    card_find: "Trouver le client", card_search_ph: "Nom, courriel ou numéro de membre",
    card_col_email: "Courriel", card_col_member: "Adhésion", card_col_card: "Carte",
    card_none: "Aucune", card_select: "Choisir", card_empty: "Aucun client pour le moment.",
    card_empty_search: "Aucun client ne correspond à la recherche.",
    card_pick_prompt: "Choisissez un client ci-dessus.",
    card_picked_new: "{name} ({num}) — aucune carte associée",
    card_picked_replace: "{name} ({num}) — actuellement associé à {card}. L’enregistrement remplace cette carte.",
    card_uid: "UID de la carte", card_uid_ph: "p. ex. A5 C7 4D 06",
    card_uid_hint: "Appuyez la carte sur le lecteur pour remplir l’UID, ou saisissez-le (chiffres hexadécimaux).",
    card_read: "Carte lue : {uid}", ok_card_linked: "Carte associée à {name}.",
    err_no_customer: "Sélectionnez d’abord un client.",
    err_invalid_card_uid: "L’UID doit contenir de 1 à 32 chiffres hexadécimaux (0–9, A–F).",
    err_customer_not_found: "Compte client introuvable.",
    err_card_taken: "Cette carte est déjà associée à un autre compte.",
    title: "Gestion des stocks", subtitle: "Produits, étiquettes et stock du magasin.",
    nav_home: "Accueil", nav_account: "Mon compte",
    stat_products: "Produits", stat_units: "Unités en stock", stat_low: "Stock faible",
    stat_out: "Rupture de stock", stat_value: "Valeur du stock",
    search_ph: "Rechercher nom, catégorie, UPC…",
    btn_add: "Ajouter un produit", btn_receive: "Réceptionner du stock",
    col_name: "Nom", col_category: "Catégorie", col_producer: "Fabricant", col_upc: "UPC",
    col_price: "Prix", col_stock: "Stock", col_last: "Dernière réception", col_actions: "Actions",
    act_receive: "Réceptionner", act_history: "Historique", act_edit: "Modifier", act_delete: "Supprimer",
    badge_low: "Faible", badge_out: "Rupture",
    empty: "Aucun produit pour le moment. Ajoutez votre premier produit.",
    empty_search: "Aucun produit ne correspond à la recherche.",
    form_add_title: "Ajouter un produit", form_edit_title: "Modifier le produit",
    f_name: "Nom", f_category: "Catégorie", f_producer: "Entreprise productrice", f_price: "Prix",
    f_upc: "UPC (code-barres)", f_upc_hint: "Scannez le code-barres ou saisissez jusqu’à 13 chiffres.",
    f_date: "Date de réception",
    tags_title: "Étiquettes RFID (EPC)",
    tags_hint: "Chaque article physique a sa propre étiquette. Le nombre d’étiquettes correspond à la quantité reçue.",
    tag_input_ph: "Saisir ou coller un EPC, puis Entrée",
    btn_tag_add: "Ajouter", btn_scan_rfid: "Lire RFID",
    rfid_none: "Aucune nouvelle étiquette détectée. Placez les étiquettes sur le lecteur.",
    rfid_found: "{n} nouvelle(s) étiquette(s) détectée(s)", btn_add_all: "Tout ajouter",
    qty: "Quantité : {n}",
    btn_save: "Enregistrer", btn_cancel: "Annuler", btn_close: "Fermer",
    receive_title: "Réceptionner du stock", receive_scan: "Scannez ou saisissez l’UPC du produit",
    receive_none: "Aucun produit sélectionné.", receive_current: "{name} — stock actuel : {n}",
    history_title: "Historique des réceptions", h_date: "Date", h_qty: "Quantité", h_note: "Note",
    history_empty: "Aucune réception enregistrée.",
    note_initial: "Stock initial", note_opening: "Stock d’ouverture",
    delete_title: "Supprimer le produit ?", delete_text: "« {name} » sera supprimé définitivement.",
    ok_added: "Produit ajouté avec succès.", ok_updated: "Produit modifié avec succès.",
    ok_deleted: "Produit supprimé avec succès.", ok_received: "{n} unité(s) de {name} reçue(s).",
    admin_denied: "Cette page est réservée aux administrateurs.", go_login: "Se connecter",
    err_login_required: "Veuillez d’abord vous connecter.",
    err_admin_required: "Accès administrateur requis.",
    err_invalid_name: "Le nom du produit est obligatoire (100 caractères max.).",
    err_invalid_category: "La catégorie est obligatoire.",
    err_invalid_producer: "L’entreprise productrice est obligatoire.",
    err_invalid_upc: "L’UPC doit contenir de 1 à 13 chiffres.",
    err_invalid_price: "Le prix doit être un nombre entre 0 et 100000.",
    err_epc_required: "Ajoutez au moins une étiquette EPC.",
    err_too_many_epcs: "500 étiquettes maximum par réception.",
    err_invalid_epc: "EPC invalide : {x} (caractères hexadécimaux seulement, 24 max.).",
    err_duplicate_epc: "EPC en double : {x}.",
    err_invalid_date: "La date n’est pas valide.",
    err_future_date: "La date de réception ne peut pas être dans le futur.",
    err_upc_taken: "Cet UPC appartient déjà à un autre produit.",
    err_epc_taken: "EPC déjà assigné : {x}.",
    err_product_not_found: "Produit introuvable.",
    err_has_sales: "Ce produit figure dans des achats passés et ne peut pas être supprimé.",
    err_server_error: "Une erreur est survenue sur le serveur.",
    err_network: "Impossible de joindre le serveur.",
    err_tag_format: "L’EPC doit contenir uniquement des caractères hexadécimaux (24 max.).",
    err_tag_listed: "Cet EPC est déjà dans la liste.",
    err_no_product: "Sélectionnez d’abord un produit (scannez son UPC).",
  },
};

// Language handling is shared with every other page (i18n.js).
SmartStore.addMessages(I18N);
const t = SmartStore.t;

/* ---------- small helpers ---------- */

const $ = id => document.getElementById(id);

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === "class") el.className = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value);
  });
  children.flat().forEach(child => {
    if (child !== null && child !== undefined) {
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
  });
  return el;
}

const money = SmartStore.money;

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toast(message, isError = false) {
  SmartStore.showToast(message, isError);
}

function normalizeEpc(value) {
  const epc = String(value || "").replace(/\s+/g, "").toUpperCase();
  return /^[0-9A-F]{1,24}$/.test(epc) ? epc : null;
}

/* Turn a server error body into a readable message: translated when the server
   sends a known error code, else the server's own text, else a generic message
   that includes the HTTP status so the cause can be found (e.g. 404 = route missing,
   500 = see the Flask console). */
function errorText(body, status) {
  if (body && body.code && I18N.en["err_" + body.code]) {
    const x = body.detail || (body.epcs && body.epcs[0]) || "";
    return t("err_" + body.code, { x });
  }
  if (body && body.error) return body.error;
  return t("err_server_error") + (status ? ` (HTTP ${status})` : "");
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(API + path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (e) {
    const err = new Error(t("err_network")); err.status = 0; throw err;
  }
  let body = {};
  try { body = await response.json(); } catch (e) {}
  if (!response.ok) {
    const err = new Error(errorText(body, response.status));
    err.status = response.status; err.body = body;
    throw err;
  }
  return body;
}

/* ---------- RFID tag collector (used by "Add product" and "Receive") ---------- */

function createTagPicker(root) {
  let tags = [];
  let timer = null;
  let panelOpen = false;

  const chips = h("div", { class: "chips" });
  const qty = h("p", { class: "qty" });
  const input = h("input", { type: "text", maxlength: "30", autocomplete: "off", spellcheck: "false" });
  const addBtn = h("button", { type: "button", class: "btn btn-outline btn-sm" });
  const scanBtn = h("button", { type: "button", class: "btn btn-primary btn-sm" });
  const panel = h("div", { class: "rfid-panel", hidden: "" });
  const title = h("h3");
  const hint = h("p", { class: "hint" });

  root.replaceChildren(title, hint,
    h("div", { class: "tag-row" }, input, addBtn, scanBtn),
    panel, chips, qty);

  function label() {
    title.textContent = t("tags_title");
    hint.textContent = t("tags_hint");
    input.placeholder = t("tag_input_ph");
    addBtn.textContent = t("btn_tag_add");
    scanBtn.textContent = t("btn_scan_rfid");
    qty.textContent = t("qty", { n: tags.length });
  }

  function draw() {
    chips.replaceChildren(...tags.map(epc =>
      h("span", { class: "chip" }, epc,
        h("button", { type: "button", "aria-label": "Remove " + epc,
          onclick: () => { tags = tags.filter(x => x !== epc); draw(); if (panelOpen) refreshPanel(); } }, "×"))));
    qty.textContent = t("qty", { n: tags.length });
  }

  function add(raw, silent = false) {
    const epc = normalizeEpc(raw);
    if (!epc) { if (!silent) toast(t("err_tag_format"), true); return false; }
    if (tags.includes(epc)) { if (!silent) toast(t("err_tag_listed"), true); return false; }
    tags.push(epc); draw(); return true;
  }

  function addTyped() { if (add(input.value)) input.value = ""; input.focus(); }
  addBtn.addEventListener("click", addTyped);
  input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addTyped(); } });

  /* The reader script posts every tag it sees to /api/scan, which records it in
     /api/rfid/discovered. New tags = discovered minus EPCs already in the database. */
  async function refreshPanel() {
    try {
      const [seen, used] = await Promise.all([
        fetch(API + "/rfid/discovered", { credentials: "same-origin" }).then(r => r.json()),
        api("/admin/tags"),
      ]);
      const taken = new Set(used.epcs);
      const fresh = (seen.epcs || []).filter(e => !taken.has(e) && !tags.includes(e));

      panel.replaceChildren(
        h("div", { class: "rfid-head" },
          h("span", {}, fresh.length ? t("rfid_found", { n: fresh.length }) : t("rfid_none")),
          fresh.length
            ? h("button", { type: "button", class: "btn btn-outline btn-sm",
                onclick: () => { fresh.forEach(e => add(e, true)); refreshPanel(); } }, t("btn_add_all"))
            : null),
        h("div", { class: "rfid-list" },
          fresh.map(epc => h("button", { type: "button",
            onclick: () => { add(epc, true); refreshPanel(); } }, epc))));
    } catch (e) { toast(e.message, true); stopPanel(); }
  }

  function startPanel() {
    panelOpen = true; panel.hidden = false; refreshPanel();
    timer = setInterval(refreshPanel, 2000);
  }
  function stopPanel() {
    panelOpen = false; panel.hidden = true;
    clearInterval(timer); timer = null;
  }
  scanBtn.addEventListener("click", () => (panelOpen ? stopPanel() : startPanel()));

  label();
  draw();

  return {
    get: () => tags.slice(),
    reset() { tags = []; input.value = ""; stopPanel(); draw(); },
    stop: stopPanel,
    relabel() { label(); draw(); if (panelOpen) refreshPanel(); },
  };
}

/* ---------- state ---------- */

let products = [];
let editingId = null;        // product being edited, null = adding
let receivingProduct = null; // product chosen in the receive dialog
let deleteTarget = null;
let searchTimer = null;

const productTags = createTagPicker($("tags-product"));
const receiveTags = createTagPicker($("tags-receive"));

/* ---------- dashboard ---------- */

async function loadProducts() {
  const query = $("search").value.trim();
  const data = await api("/admin/products" + (query ? "?q=" + encodeURIComponent(query) : ""));
  products = data.products;

  $("stat-products").textContent = data.summary.product_count;
  $("stat-units").textContent = data.summary.units_in_stock;
  $("stat-low").textContent = data.summary.low_stock_count;
  $("stat-out").textContent = data.summary.out_of_stock_count;
  $("stat-value").textContent = money(data.summary.stock_value);
  renderRows(query);
}

function renderRows(query = "") {
  const body = $("product-rows");

  body.replaceChildren(...products.map(p => {
    const out = p.stock === 0;
    const badge = out
      ? h("span", { class: "badge badge-out" }, t("badge_out"))
      : p.low_stock ? h("span", { class: "badge badge-low" }, t("badge_low")) : null;

    return h("tr", { class: out ? "row-out" : p.low_stock ? "row-low" : "" },
      h("td", {}, p.name),
      h("td", {}, p.category || "—"),
      h("td", {}, p.producer_company || "—"),
      h("td", {}, p.upc || "—"),
      h("td", { class: "num" }, money(p.price)),
      h("td", { class: "num" }, badge, p.stock),
      h("td", {}, p.last_received || "—"),
      h("td", { class: "actions" },
        h("button", { class: "btn btn-outline btn-sm", onclick: () => openReceive(p) }, t("act_receive")),
        h("button", { class: "btn btn-ghost btn-sm", onclick: () => openHistory(p) }, t("act_history")),
        h("button", { class: "btn btn-ghost btn-sm", onclick: () => openProductForm(p) }, t("act_edit")),
        h("button", { class: "btn btn-ghost btn-sm", onclick: () => openDelete(p) }, t("act_delete"))));
  }));

  const note = $("empty-note");
  note.hidden = products.length > 0;
  note.textContent = query ? t("empty_search") : t("empty");
}

/* ---------- add / edit ---------- */

function openProductForm(product = null) {
  editingId = product ? product.product_id : null;
  $("product-title").textContent = t(product ? "form_edit_title" : "form_add_title");
  $("f-name").value = product ? product.name : "";
  $("f-category").value = product ? product.category || "" : "";
  $("f-producer").value = product ? product.producer_company || "" : "";
  $("f-price").value = product ? product.price : "";
  $("f-upc").value = product ? product.upc || "" : "";
  $("f-date-product").value = todayIso();
  $("f-date-product").max = todayIso();
  $("product-error").textContent = "";
  productTags.reset();
  $("product-tags-block").hidden = !!product;   // tags are added via "Receive"
  $("dlg-product").showModal();
  (product ? $("f-name") : $("f-upc")).focus();  // new product: ready for the barcode scanner
}

// Barcode scanners type the digits and press Enter: jump to the next field instead of submitting.
$("f-upc").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); $("f-name").focus(); }
});

$("form-product").addEventListener("submit", async e => {
  e.preventDefault();
  $("product-error").textContent = "";

  const payload = {
    name: $("f-name").value, category: $("f-category").value,
    producer_company: $("f-producer").value, price: $("f-price").value,
    upc: $("f-upc").value,
  };

  try {
    if (editingId) {
      await api(`/admin/products/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      toast(t("ok_updated"));
    } else {
      payload.epcs = productTags.get();
      payload.date_received = $("f-date-product").value || null;
      await api("/admin/products", { method: "POST", body: JSON.stringify(payload) });
      toast(t("ok_added"));
    }
    closeDialog($("dlg-product"));
    await loadProducts();
  } catch (err) {
    $("product-error").textContent = err.message;
    toast(err.message, true);
  }
});

/* ---------- receive stock ---------- */

function showPicked() {
  $("r-picked").textContent = receivingProduct
    ? t("receive_current", { name: receivingProduct.name, n: receivingProduct.stock })
    : t("receive_none");
}

function openReceive(product = null) {
  receivingProduct = product;
  $("r-upc").value = product ? product.upc || "" : "";
  $("f-date-receive").value = todayIso();
  $("f-date-receive").max = todayIso();
  $("receive-error").textContent = "";
  receiveTags.reset();
  showPicked();
  $("dlg-receive").showModal();
  (product ? $("tags-receive").querySelector("input") : $("r-upc")).focus();
}

async function lookupUpc() {
  const upc = $("r-upc").value.trim();
  if (!upc) return;
  try {
    const data = await api("/admin/products/by-upc/" + encodeURIComponent(upc));
    receivingProduct = data.product;
    showPicked();
    $("tags-receive").querySelector("input").focus();
  } catch (err) {
    receivingProduct = null; showPicked();
    $("receive-error").textContent = err.message;
  }
}
$("r-upc").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); lookupUpc(); } });
$("r-upc").addEventListener("change", lookupUpc);

$("form-receive").addEventListener("submit", async e => {
  e.preventDefault();
  $("receive-error").textContent = "";

  if (!receivingProduct) { $("receive-error").textContent = t("err_no_product"); return; }

  try {
    const data = await api(`/admin/products/${receivingProduct.product_id}/receive`, {
      method: "POST",
      body: JSON.stringify({ epcs: receiveTags.get(), date_received: $("f-date-receive").value || null }),
    });
    toast(t("ok_received", { n: data.quantity, name: data.product.name }));
    closeDialog($("dlg-receive"));
    await loadProducts();
  } catch (err) {
    $("receive-error").textContent = err.message;
    toast(err.message, true);
  }
});

/* ---------- link a membership card to a customer account ---------- */

let cardCustomer = null;   // customer chosen in the dialog
let cardTimer = null;      // polls the card reader while the dialog is open
let cardSearchTimer = null;

function showCardPicked() {
  $("c-picked").textContent = !cardCustomer ? t("card_pick_prompt")
    : cardCustomer.card_id
      ? t("card_picked_replace", { name: cardCustomer.name, num: cardCustomer.membership_number, card: cardCustomer.card_id })
      : t("card_picked_new", { name: cardCustomer.name, num: cardCustomer.membership_number });
}

function renderCustomers(customers, query) {
  $("c-rows").replaceChildren(...customers.map(c =>
    h("tr", { class: cardCustomer && cardCustomer.user_id === c.user_id ? "row-low" : "" },
      h("td", {}, c.name),
      h("td", {}, c.email),
      h("td", {}, c.membership_number),
      h("td", {}, c.card_id || t("card_none")),
      h("td", {}, h("button", { type: "button", class: "btn btn-outline btn-sm",
        onclick: () => { cardCustomer = c; showCardPicked(); renderCustomers(customers, query); $("c-uid").focus(); } },
        t("card_select"))))));

  const note = $("c-empty");
  note.hidden = customers.length > 0;
  note.textContent = query ? t("card_empty_search") : t("card_empty");
}

async function loadCustomers() {
  const query = $("c-search").value.trim();
  try {
    const data = await api("/admin/customers" + (query ? "?q=" + encodeURIComponent(query) : ""));
    renderCustomers(data.customers, query);
  } catch (err) { $("card-error").textContent = err.message; }
}

// The ESP32 reader publishes taps to /api/membership/last-card (same as the cart page).
const readerCard = () =>
  fetch(API + "/membership/last-card", { credentials: "same-origin" }).then(r => r.json());

async function startCardWatch() {
  stopCardWatch();
  let lastScan;
  try { lastScan = (await readerCard()).scan_id; }
  catch (e) { return; }                      // reader unavailable: the UID can still be typed

  cardTimer = setInterval(async () => {
    try {
      const card = await readerCard();
      if (card.uid && card.scan_id !== lastScan) {
        lastScan = card.scan_id;
        $("c-uid").value = card.uid;
        toast(t("card_read", { uid: card.uid }));
      }
    } catch (e) { /* try again next second */ }
  }, 1000);
}

function stopCardWatch() { clearInterval(cardTimer); cardTimer = null; }

function openCardDialog() {
  cardCustomer = null;
  $("c-search").value = "";
  $("c-uid").value = "";
  $("card-error").textContent = "";
  showCardPicked();
  $("c-rows").replaceChildren();
  $("c-empty").hidden = true;
  $("dlg-card").showModal();
  loadCustomers();
  startCardWatch();
  $("c-search").focus();
}

$("btn-card").addEventListener("click", openCardDialog);

$("c-search").addEventListener("input", () => {
  clearTimeout(cardSearchTimer);
  cardSearchTimer = setTimeout(loadCustomers, 250);
});

$("form-card").addEventListener("submit", async e => {
  e.preventDefault();
  $("card-error").textContent = "";

  if (!cardCustomer) { $("card-error").textContent = t("err_no_customer"); return; }

  try {
    const data = await api(`/admin/customers/${cardCustomer.user_id}/card`, {
      method: "POST",
      body: JSON.stringify({ card_id: $("c-uid").value }),
    });
    toast(t("ok_card_linked", { name: data.customer.name }));
    closeDialog($("dlg-card"));
  } catch (err) {
    $("card-error").textContent = err.message;
    toast(err.message, true);
  }
});

/* ---------- history ---------- */

async function openHistory(product) {
  $("history-name").textContent = product.name;
  const body = $("history-rows");
  body.replaceChildren();
  try {
    const data = await api(`/admin/products/${product.product_id}/receptions`);
    if (!data.receptions.length) {
      body.append(h("tr", {}, h("td", { colspan: "3" }, t("history_empty"))));
    }
    data.receptions.forEach(r => {
      const note = r.note === "Initial stock" ? t("note_initial")
                 : r.note === "Opening stock" ? t("note_opening") : r.note || "";
      body.append(h("tr", {}, h("td", {}, r.date_received), h("td", { class: "num" }, r.quantity), h("td", {}, note)));
    });
    $("dlg-history").showModal();
  } catch (err) { toast(err.message, true); }
}

/* ---------- delete ---------- */

function openDelete(product) {
  deleteTarget = product;
  $("delete-text").textContent = t("delete_text", { name: product.name });
  $("dlg-delete").showModal();
}

$("confirm-delete").addEventListener("click", async () => {
  if (!deleteTarget) return;
  try {
    await api(`/admin/products/${deleteTarget.product_id}`, { method: "DELETE" });
    toast(t("ok_deleted"));
    await loadProducts();
  } catch (err) {
    toast(err.message, true);
  }
  closeDialog($("dlg-delete"));
});

/* ---------- dialogs, search, language ---------- */

function closeDialog(dialog) {
  if (dialog.id === "dlg-product") productTags.stop();
  if (dialog.id === "dlg-receive") receiveTags.stop();
  if (dialog.id === "dlg-card") stopCardWatch();
  dialog.close();
}

document.querySelectorAll("dialog").forEach(dialog => {
  dialog.addEventListener("close", () => { productTags.stop(); receiveTags.stop(); stopCardWatch(); });
  dialog.querySelectorAll("[data-close]").forEach(btn =>
    btn.addEventListener("click", () => closeDialog(dialog)));
});

$("btn-add").addEventListener("click", () => openProductForm());
$("btn-receive").addEventListener("click", () => openReceive());

$("search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadProducts().catch(e => toast(e.message, true)), 250);
});

document.addEventListener("smartstore:languagechange", () => {
  productTags.relabel(); receiveTags.relabel();
  $("product-title").textContent = t(editingId ? "form_edit_title" : "form_add_title");
  showPicked();
  showCardPicked();
  renderRows($("search").value.trim());
  if (!$("adm-main").hidden) loadProducts().catch(() => {});
});

/* ---------- start ---------- */

(async function start() {
  SmartStore.apply();
  try {
    await api("/admin/me");
  } catch (err) {
    if (err.status === 401) { window.location.href = "login.html"; return; }
    $("denied").hidden = false;
    return;
  }
  $("adm-main").hidden = false;
  loadProducts().catch(err => toast(err.message, true));
})();
