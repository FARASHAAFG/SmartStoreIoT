const form = document.getElementById("customerForm");
const message = document.getElementById("message");

form.addEventListener("submit", async function(event) {

    event.preventDefault();

    const name = document.getElementById("name").value.trim();
    const address = document.getElementById("address").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const email = document.getElementById("email").value.trim();

    if (name === "" || address === "" || phone === "" || email === "") {
        showError("Please fill in all fields.");
        return;
    }

    const phonePattern = /^[0-9\s()+-]{7,20}$/;

    if (!phonePattern.test(phone)) {
        showError("Please enter a valid telephone number.");
        return;
    }

    const customer = {
        name: name,
        address: address,
        telephone: phone,
        email: email
    };

    try {

        const response = await fetch("http://127.0.0.1:5000/customers", {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(customer)
        });

        const result = await response.json();

        if (response.ok) {
            showSuccess(result.message);
            form.reset();
        } else {
            showError(result.message);
        }

    } catch (error) {

        console.error(error);
        showError("Could not connect to the server.");

    }
});


function showSuccess(text) {
    message.textContent = text;

    message.style.display = "block";
    message.style.color = "#166534";
    message.style.backgroundColor = "#dcfce7";
    message.style.border = "1px solid #86efac";
}


function showError(text) {
    message.textContent = text;

    message.style.display = "block";
    message.style.color = "#991b1b";
    message.style.backgroundColor = "#fee2e2";
    message.style.border = "1px solid #fca5a5";
}