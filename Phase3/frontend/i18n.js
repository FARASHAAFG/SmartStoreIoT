/* SmartStore — shared English / French support.
   Load this BEFORE qol.js and the page scripts:  <script src="i18n.js"></script>

   Markup:   <span data-i18n="key"></span>
             <input data-i18n-placeholder="key">   (also data-i18n-title / data-i18n-aria-label)
             <h2 data-i18n="key" data-i18n-vars='{"name":"Ana"}'></h2>
             <strong data-money="12.5"></strong>   <p data-date="2026-11-15T10:00:00"></p>
   Script:   SmartStore.t(key, vars), setText(el, key, vars), setRaw(el, text), setMoney(el, v), ...
   Placeholders in messages: {name}  {m:amount} (currency)  {d:when} (date/time)
   Plurals:  define key_one / key_other and pass {n: count}.                        */
(function () {
    "use strict";

    const LANG_KEY = "smartstore-lang";
    const SUPPORTED = ["en", "fr"];
    const messages = { en: {}, fr: {} };

    function detectLanguage() {
        try {
            const saved = localStorage.getItem(LANG_KEY);
            if (SUPPORTED.includes(saved)) return saved;
        } catch (e) { /* storage blocked */ }
        return (navigator.language || "en").toLowerCase().startsWith("fr") ? "fr" : "en";
    }

    let lang = detectLanguage();
    document.documentElement.lang = lang;

    const locale = () => (lang === "fr" ? "fr-CA" : "en-CA");
    const has = key => Object.prototype.hasOwnProperty.call(messages.en, key);

    function addMessages(dict) {
        SUPPORTED.forEach(l => Object.assign(messages[l], dict[l] || {}));
    }

    /* ---------- formatting ---------- */

    function money(value) {
        return new Intl.NumberFormat(locale(), { style: "currency", currency: "CAD" })
            .format(Number(value) || 0);
    }

    function formatDate(value) {
        if (!value) return t("date_unavailable");
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return String(value);
        return d.toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" });
    }

    function t(key, vars) {
        vars = vars || {};
        let k = key;
        if (vars.n !== undefined) {
            const form = new Intl.PluralRules(locale()).select(Number(vars.n)) === "one" ? "_one" : "_other";
            if (has(key + form)) k = key + form;
        }
        const text = (messages[lang] && messages[lang][k]) ?? messages.en[k] ?? key;
        return text.replace(/\{(m:|d:)?(\w+)\}/g, (_, kind, name) => {
            const v = vars[name];
            if (v === undefined || v === null) return "";
            if (kind === "m:") return money(v);
            if (kind === "d:") return formatDate(v);
            return String(v);
        });
    }

    /* ---------- applying translations to the DOM ---------- */

    const ATTRS = [["i18nPlaceholder", "placeholder"], ["i18nTitle", "title"], ["i18nAriaLabel", "aria-label"]];
    const SELECTOR = "[data-i18n],[data-i18n-placeholder],[data-i18n-title],[data-i18n-aria-label],[data-money],[data-date]";

    function readVars(el) {
        try { return el.dataset.i18nVars ? JSON.parse(el.dataset.i18nVars) : {}; }
        catch (e) { return {}; }
    }

    function apply(root) {
        root = root || document;
        const nodes = Array.from(root.querySelectorAll(SELECTOR));
        if (root.matches && root.matches(SELECTOR)) nodes.unshift(root);

        nodes.forEach(el => {
            const vars = readVars(el);
            if (el.dataset.i18n) el.textContent = t(el.dataset.i18n, vars);
            ATTRS.forEach(([ds, attr]) => {
                if (el.dataset[ds]) el.setAttribute(attr, t(el.dataset[ds], vars));
            });
            if (el.dataset.money !== undefined) el.textContent = money(el.dataset.money);
            if (el.dataset.date !== undefined) el.textContent = formatDate(el.dataset.date);
        });
    }

    /* Helpers for text that scripts create. They remember the key, so the text
       re-translates by itself when the language changes. */
    function reset(el) {
        delete el.dataset.i18n;
        delete el.dataset.i18nVars;
        delete el.dataset.money;
        delete el.dataset.date;
    }
    function setText(el, key, vars) {
        reset(el);
        el.dataset.i18n = key;
        if (vars) el.dataset.i18nVars = JSON.stringify(vars);
        el.textContent = t(key, vars);
    }
    function setRaw(el, text) { reset(el); el.textContent = text; }
    function setMoney(el, value) { reset(el); el.dataset.money = value; el.textContent = money(value); }
    function setDate(el, value) { reset(el); el.dataset.date = value ?? ""; el.textContent = formatDate(value); }
    function setAttr(el, attr, key, vars) {
        const entry = ATTRS.find(a => a[1] === attr);
        el.dataset[entry[0]] = key;
        if (vars) el.dataset.i18nVars = JSON.stringify(vars);
        el.setAttribute(attr, t(key, vars));
    }

    /* ---------- notifications ---------- */

    function showToast(message, isError) {
        let container = document.getElementById("toasts");
        if (!container) {
            container = document.createElement("div");
            container.id = "toasts";
            container.className = "toasts";
            container.setAttribute("aria-live", "polite");
            document.body.appendChild(container);
        }

        const toast = document.createElement("div");
        toast.className = "toast" + (isError ? " error" : "");
        toast.setAttribute("role", isError ? "alert" : "status");
        toast.setAttribute("aria-atomic", "true");
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 6000);
    }

    function notify(key, vars, isError) {
        showToast(t(key, vars), isError);
    }

    function notifyOnNextPage(key, vars) {
        try {
            sessionStorage.setItem("smartstore-notification", JSON.stringify({ key, vars }));
        } catch (error) {
            notify(key, vars);
        }
    }

    function showPendingNotification() {
        let pending;
        try {
            pending = sessionStorage.getItem("smartstore-notification");
            sessionStorage.removeItem("smartstore-notification");
        } catch (error) {
            return;
        }
        if (!pending) return;

        try {
            const notification = JSON.parse(pending);
            if (notification && typeof notification.key === "string") {
                notify(notification.key, notification.vars);
            }
        } catch (error) {
            return;
        }
    }

    /* ---------- errors ---------- */

    function makeError(key, vars) {
        const error = new Error(t(key, vars));
        error.key = key;
        error.vars = vars;
        return error;
    }

    // Prefer a translated message when the server sends an error "code"
    // (err_<code> in the dictionary); otherwise use the server's own text.
    function fromResponse(data, fallbackKey) {
        data = data || {};
        if (data.code && has("err_" + data.code)) {
            return makeError("err_" + data.code, { x: data.detail || "" });
        }
        const raw = data.message || data.error;
        return raw ? new Error(raw) : makeError(fallbackKey || "err_generic");
    }

    function showError(el, error, fallbackKey) {
        if (error && error.key) setText(el, error.key, error.vars);
        else if (error instanceof TypeError) setText(el, "err_network");
        else setRaw(el, (error && error.message) || t(fallbackKey || "err_generic"));
    }

    /* ---------- language switching ---------- */

    function setLang(next) {
        if (!SUPPORTED.includes(next) || next === lang) return;
        lang = next;
        try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
        document.documentElement.lang = lang;
        apply(document);
        document.dispatchEvent(new CustomEvent("smartstore:languagechange", { detail: { lang } }));
    }

    document.addEventListener("DOMContentLoaded", () => apply(document));

    /* ---------- translations shared by the customer-facing pages ---------- */

    addMessages({
        en: {
            nav_home: "Home", nav_account: "My Account", nav_cart: "Shopping Cart",
            nav_admin: "Inventory (admin)", admin_label: "Administrator", nav_logout: "Log Out",
            home_signed_in: "Signed in as {name}", cart_greeting: "Welcome back, {name}!",
            btn_close: "Close", date_unavailable: "Date unavailable", total: "Total",
            err_generic: "Something went wrong.", err_network: "Cannot reach the server.",
            err_server_error: "Something went wrong on the server.",

            qol_toolbar: "Display and accessibility settings", qol_text_size: "Text size",
            qol_smaller: "Make text smaller", qol_bigger: "Make text bigger",
            qol_to_light: "Switch to Light Mode", qol_to_dark: "Switch to Dark Mode",
            qol_light: "Light", qol_dark: "Dark", qol_switch_lang: "Passer au français",

            title_index: "SmartStore | Welcome", index_h1: "Welcome to SmartStore",
            index_sub: "Your smart, fast, and convenient shopping experience.",
            feat_rfid: "Automatic RFID Scanning", feat_cart: "Real-Time Shopping Cart",
            feat_checkout: "Quick Self-Checkout", start_shopping: "Start Shopping",
            already_member: "Already a member?", login_to_account: "Log in to your account",
            new_to: "New to SmartStore?", create_account: "Create an account",

            title_login: "SmartStore | Login", login_h1: "Welcome Back",
            login_sub: "Log in to access your SmartStore account.",
            email_label: "Email address", email_ph: "Enter your email",
            password_label: "Password", password_ph: "Enter your password",
            login_btn: "Log In", no_account: "Don't have an account?", back_home: "Back to home",
            err_login_failed: "Incorrect email or password.", err_login_generic: "Login failed.",

            title_register: "SmartStore | Register", reg_h1: "Create an Account",
            reg_sub: "Join SmartStore and start earning loyalty points.",
            fullname: "Full name", name_ph: "Enter your name", password_new_ph: "At least 8 characters",
            reg_btn: "Create Account", have_account: "Already have an account?", login_short: "Log in",
            err_register_failed: "Registration failed.",
            card_link_label: "Link a membership card (optional)", card_link_ph: "Tap your card on the card reader",
            card_link_hint: "Got your membership card? Tap it now to link it to your account. Leave this empty to just log in.",
            msg_card_detected: "Card detected: {uid}",
            msg_card_linked: "Logged in. Your membership card is now linked to your account.",
            err_card_link_failed: "Could not link the membership card.",
            err_invalid_card_uid: "Card UID must be 1 to 32 hex digits (0–9, A–F).",
            err_card_taken: "This card is already linked to another account.",

            title_account: "SmartStore | My Account", acct_h1: "My SmartStore Account",
            acct_sub: "Manage your membership and view your purchases.",
            acct_hello: "Hello, {name}!", customer_fallback: "Customer",
            acct_welcome: "Welcome to your customer dashboard.",
            membership_number: "Membership number:", loading: "Loading...", not_assigned: "Not assigned",
            acct_card_label: "Membership card:", acct_card_linked: "Linked (ends in {last4})",
            acct_card_none: "Not linked yet — ask a staff member at the store to link your card.",
            loyalty_points: "Loyalty Points", total_purchases: "Total Purchases",
            tx_history: "Transaction History", tx_history_sub: "Your previous SmartStore purchases.",
            tx_loading: "Loading your transactions...", tx_empty: "You have not made any purchases yet.",
            tx_title: "Transaction #{id}", points_earned: "Points earned: {n}",
            view_details: "View Details", tx_details: "Transaction Details",
            err_load_profile: "Could not load customer profile.",
            err_load_transactions: "Could not load transactions.",
            err_load_details: "Could not load transaction details.",
            err_logout: "Could not log out. Please try again.",
            msg_login_success: "Signed in successfully.",
            msg_registration_success: "Account created successfully.",
            msg_logout_success: "Signed out successfully.",

            title_cart: "SmartStore | Shopping Cart", cart_eyebrow: "SELF CHECKOUT",
            cart_h1: "Your Shopping Cart",
            cart_intro: "Place your items in the checkout area. They'll appear here automatically.",
            scanned_products: "Scanned Products",
            items_in_cart_one: "{n} item in your cart", items_in_cart_other: "{n} items in your cart",
            cart_empty_h: "Your cart is empty", cart_empty_p: "Scan a product to get started.",
            order_summary: "Order Summary", summary_items: "Items", subtotal: "Subtotal",
            summary_note: "Final taxes and payment will be handled at checkout.",
            checkout_btn: "Proceed to Checkout", clear_cart: "Clear Cart",
            each_qty: "{m:price} each · Qty: {n}",
            remove_one: "Remove one item", remove_one_named: "Remove one {name}",
            msg_cart_added_one: "Product added to your cart successfully.",
            msg_cart_added_other: "{n} products added to your cart successfully.",
            msg_removed: "Item removed from your cart.", msg_cleared: "Your cart has been cleared.",
            confirm_clear: "Are you sure you want to remove all items from your cart?",
            err_cart_trouble: "We're having trouble updating your cart. Please ask for assistance.",
            msg_scan_first: "Scan at least one product before checking out.",

            co_before_pay: "Before You Pay",
            co_before_desc: "Scan your membership card to earn points, or continue as a guest.",
            co_member_h: "Member Checkout",
            co_member_p: "Tap your membership card on the card reader, or enter its UID, to associate this purchase with your account and earn points.",
            co_uid_ph: "Enter RFID card UID", co_identify: "Identify Membership",
            co_guest_h: "Guest Checkout",
            co_guest_p: "Continue without a membership account. Guest purchases do not earn membership points.",
            co_guest_btn: "Continue as Guest", co_back_cart: "Back to Cart",
            co_account_p: "You are logged in as {name}. This purchase will earn points on your account.", co_account_btn: "Continue as {name}",
            co_enter_uid: "Please enter your membership card UID.",
            co_checking: "Checking membership card...",
            co_recognized: "Membership recognized successfully.",
            co_not_recognized: "Membership card could not be recognized.",
            co_preparing_guest: "Preparing guest checkout...",
            co_guest_fail: "Unable to start guest checkout. Please try again.",
            co_guest_ready: "Guest checkout selected.",
            co_confirm_h: "Confirm Your Order",
            co_confirm_desc: "Please review your order before proceeding to simulated payment.",
            co_customer_type: "Customer type", co_member: "Member", co_guest: "Guest",
            co_num_items: "Number of items",
            co_member_note: "Your purchase will be associated with your membership account.",
            co_guest_note: "This purchase will not be associated with a membership account.",
            co_back: "Back", co_continue_pay: "Continue to Payment",

            pay_h: "Payment",
            pay_desc: "This is a simulated payment for the SmartStore project. No real payment or bank transaction will take place.",
            pay_method: "Payment method", pay_simulated: "Simulated payment",
            pay_amount: "Amount to pay", pay_back: "Back to Order",
            pay_confirm: "Confirm Simulated Payment", pay_recording: "Recording your purchase...",
            err_missing_product_id: "A scanned product is missing its product ID.",
            err_purchase_failed: "Unable to complete your purchase.",

            rc_success: "Purchase Successful!", rc_recorded: "Your SmartStore transaction has been recorded.",
            rc_date: "Date: {d:date}", rc_customer_guest: "Customer: Guest",
            rc_customer_member: "Customer: {name}", rc_membership: "Membership: {num}",
            rc_emailed: "Receipt emailed to {email}.",
            rc_emailed_generic: "Receipt emailed to your email address.",
            rc_email_failed: "The receipt could not be emailed.",
            rc_items_h: "Purchased Products", rc_total_paid: "Total paid: {m:amount}",
            rc_simulated_note: "Payment was simulated; no real payment was processed.",
            rc_new_session: "Start New Shopping Session",
            rc_cart_not_cleared: "Your sale was recorded, but the RFID cart could not be cleared. Please ask for assistance before the next customer.",
            msg_sale_recorded: "Checkout completed successfully.",
            msg_checkout_cancelled: "Checkout cancelled. Your scanned items remain in the cart.",
            msg_ready_next: "Ready for the next customer.",
        },
        fr: {
            nav_home: "Accueil", nav_account: "Mon compte", nav_cart: "Panier",
            nav_admin: "Inventaire (admin)", admin_label: "Administrateur", nav_logout: "Se déconnecter",
            home_signed_in: "Connecté en tant que {name}", cart_greeting: "Bon retour, {name} !",
            btn_close: "Fermer", date_unavailable: "Date non disponible", total: "Total",
            err_generic: "Une erreur est survenue.", err_network: "Impossible de joindre le serveur.",
            err_server_error: "Une erreur est survenue sur le serveur.",

            qol_toolbar: "Paramètres d’affichage et d’accessibilité", qol_text_size: "Taille du texte",
            qol_smaller: "Réduire le texte", qol_bigger: "Agrandir le texte",
            qol_to_light: "Passer au mode clair", qol_to_dark: "Passer au mode sombre",
            qol_light: "Clair", qol_dark: "Sombre", qol_switch_lang: "Switch to English",

            title_index: "SmartStore | Bienvenue", index_h1: "Bienvenue chez SmartStore",
            index_sub: "Une expérience d’achat intelligente, rapide et pratique.",
            feat_rfid: "Lecture RFID automatique", feat_cart: "Panier en temps réel",
            feat_checkout: "Caisse libre-service rapide", start_shopping: "Commencer mes achats",
            already_member: "Déjà membre ?", login_to_account: "Se connecter à votre compte",
            new_to: "Nouveau chez SmartStore ?", create_account: "Créer un compte",

            title_login: "SmartStore | Connexion", login_h1: "Content de vous revoir",
            login_sub: "Connectez-vous pour accéder à votre compte SmartStore.",
            email_label: "Adresse courriel", email_ph: "Entrez votre adresse courriel",
            password_label: "Mot de passe", password_ph: "Entrez votre mot de passe",
            login_btn: "Se connecter", no_account: "Vous n’avez pas de compte ?", back_home: "Retour à l’accueil",
            err_login_failed: "Courriel ou mot de passe incorrect.", err_login_generic: "Échec de la connexion.",

            title_register: "SmartStore | Inscription", reg_h1: "Créer un compte",
            reg_sub: "Joignez-vous à SmartStore et commencez à accumuler des points de fidélité.",
            fullname: "Nom complet", name_ph: "Entrez votre nom", password_new_ph: "Au moins 8 caractères",
            reg_btn: "Créer mon compte", have_account: "Vous avez déjà un compte ?", login_short: "Se connecter",
            err_register_failed: "Échec de l’inscription.",
            card_link_label: "Associer une carte de membre (facultatif)", card_link_ph: "Passez votre carte sur le lecteur",
            card_link_hint: "Vous avez reçu votre carte de membre ? Passez-la maintenant pour l’associer à votre compte. Laissez ce champ vide pour simplement vous connecter.",
            msg_card_detected: "Carte détectée : {uid}",
            msg_card_linked: "Connexion réussie. Votre carte de membre est maintenant associée à votre compte.",
            err_card_link_failed: "Impossible d’associer la carte de membre.",
            err_invalid_card_uid: "L’UID doit contenir de 1 à 32 chiffres hexadécimaux (0–9, A–F).",
            err_card_taken: "Cette carte est déjà associée à un autre compte.",

            title_account: "SmartStore | Mon compte", acct_h1: "Mon compte SmartStore",
            acct_sub: "Gérez votre adhésion et consultez vos achats.",
            acct_hello: "Bonjour, {name} !", customer_fallback: "Client",
            acct_welcome: "Bienvenue dans votre tableau de bord client.",
            membership_number: "Numéro de membre :", loading: "Chargement…", not_assigned: "Non attribué",
            acct_card_label: "Carte de membre :", acct_card_linked: "Associée (se termine par {last4})",
            acct_card_none: "Pas encore associée — demandez à un employé du magasin d’associer votre carte.",
            loyalty_points: "Points de fidélité", total_purchases: "Nombre d’achats",
            tx_history: "Historique des transactions", tx_history_sub: "Vos achats précédents chez SmartStore.",
            tx_loading: "Chargement de vos transactions…", tx_empty: "Vous n’avez encore effectué aucun achat.",
            tx_title: "Transaction n° {id}", points_earned: "Points gagnés : {n}",
            view_details: "Voir les détails", tx_details: "Détails de la transaction",
            err_load_profile: "Impossible de charger le profil du client.",
            err_load_transactions: "Impossible de charger les transactions.",
            err_load_details: "Impossible de charger les détails de la transaction.",
            err_logout: "Impossible de se déconnecter. Veuillez réessayer.",
            msg_login_success: "Vous êtes connecté avec succès.",
            msg_registration_success: "Votre compte a été créé avec succès.",
            msg_logout_success: "Vous êtes déconnecté.",

            title_cart: "SmartStore | Panier", cart_eyebrow: "CAISSE LIBRE-SERVICE",
            cart_h1: "Votre panier",
            cart_intro: "Placez vos articles dans la zone de caisse. Ils apparaîtront ici automatiquement.",
            scanned_products: "Produits numérisés",
            items_in_cart_one: "{n} article dans votre panier", items_in_cart_other: "{n} articles dans votre panier",
            cart_empty_h: "Votre panier est vide", cart_empty_p: "Numérisez un produit pour commencer.",
            order_summary: "Résumé de la commande", summary_items: "Articles", subtotal: "Sous-total",
            summary_note: "Les taxes finales et le paiement seront traités à la caisse.",
            checkout_btn: "Passer à la caisse", clear_cart: "Vider le panier",
            each_qty: "{m:price} chacun · Qté : {n}",
            remove_one: "Retirer un article", remove_one_named: "Retirer un exemplaire de {name}",
            msg_cart_added_one: "Produit ajouté à votre panier avec succès.",
            msg_cart_added_other: "{n} produits ajoutés à votre panier avec succès.",
            msg_removed: "Article retiré de votre panier.", msg_cleared: "Votre panier a été vidé.",
            confirm_clear: "Voulez-vous vraiment retirer tous les articles de votre panier ?",
            err_cart_trouble: "Nous avons de la difficulté à mettre à jour votre panier. Veuillez demander de l’aide.",
            msg_scan_first: "Numérisez au moins un produit avant de passer à la caisse.",

            co_before_pay: "Avant de payer",
            co_before_desc: "Numérisez votre carte de membre pour accumuler des points, ou continuez en tant qu’invité.",
            co_member_h: "Paiement membre",
            co_member_p: "Appuyez votre carte de membre sur le lecteur, ou saisissez son UID, pour associer cet achat à votre compte et accumuler des points.",
            co_uid_ph: "Saisissez l’UID de la carte RFID", co_identify: "Identifier l’adhésion",
            co_guest_h: "Paiement invité",
            co_guest_p: "Continuez sans compte de membre. Les achats des invités n’accumulent pas de points.",
            co_guest_btn: "Continuer en tant qu’invité", co_back_cart: "Retour au panier",
            co_account_p: "Vous êtes connecté en tant que {name}. Cet achat accumulera des points dans votre compte.", co_account_btn: "Continuer en tant que {name}",
            co_enter_uid: "Veuillez saisir l’UID de votre carte de membre.",
            co_checking: "Vérification de la carte de membre…",
            co_recognized: "Adhésion reconnue avec succès.",
            co_not_recognized: "La carte de membre n’a pas pu être reconnue.",
            co_preparing_guest: "Préparation du paiement invité…",
            co_guest_fail: "Impossible de démarrer le paiement invité. Veuillez réessayer.",
            co_guest_ready: "Paiement invité sélectionné.",
            co_confirm_h: "Confirmez votre commande",
            co_confirm_desc: "Veuillez vérifier votre commande avant de passer au paiement simulé.",
            co_customer_type: "Type de client", co_member: "Membre", co_guest: "Invité",
            co_num_items: "Nombre d’articles",
            co_member_note: "Votre achat sera associé à votre compte de membre.",
            co_guest_note: "Cet achat ne sera pas associé à un compte de membre.",
            co_back: "Retour", co_continue_pay: "Continuer vers le paiement",

            pay_h: "Paiement",
            pay_desc: "Il s’agit d’un paiement simulé pour le projet SmartStore. Aucun paiement réel ni opération bancaire n’aura lieu.",
            pay_method: "Mode de paiement", pay_simulated: "Paiement simulé",
            pay_amount: "Montant à payer", pay_back: "Retour à la commande",
            pay_confirm: "Confirmer le paiement simulé", pay_recording: "Enregistrement de votre achat…",
            err_missing_product_id: "Un produit numérisé n’a pas d’identifiant.",
            err_purchase_failed: "Impossible de finaliser votre achat.",

            rc_success: "Achat réussi !", rc_recorded: "Votre transaction SmartStore a été enregistrée.",
            rc_date: "Date : {d:date}", rc_customer_guest: "Client : Invité",
            rc_customer_member: "Client : {name}", rc_membership: "Numéro de membre : {num}",
            rc_emailed: "Reçu envoyé par courriel à {email}.",
            rc_emailed_generic: "Reçu envoyé à votre adresse courriel.",
            rc_email_failed: "Le reçu n’a pas pu être envoyé par courriel.",
            rc_items_h: "Produits achetés", rc_total_paid: "Total payé : {m:amount}",
            rc_simulated_note: "Le paiement était simulé ; aucun paiement réel n’a été effectué.",
            rc_new_session: "Commencer une nouvelle session d’achats",
            rc_cart_not_cleared: "Votre vente a été enregistrée, mais le panier RFID n’a pas pu être vidé. Veuillez demander de l’aide avant le client suivant.",
            msg_sale_recorded: "Paiement terminé avec succès.",
            msg_checkout_cancelled: "Paiement annulé. Vos articles numérisés restent dans le panier.",
            msg_ready_next: "Prêt pour le client suivant.",
        },
    });

    window.SmartStore = {
        get lang() { return lang; },
        setLang, addMessages, has, t, apply,
        setText, setRaw, setMoney, setDate, setAttr,
        money, formatDate, makeError, fromResponse, showError,
        showToast, notify, notifyOnNextPage, showPendingNotification,
    };
})();
