const form = document.getElementById("customerForm");
const message = document.getElementById("message");

form.addEventListener("submit", function(event) {

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

    // temporary, later we will send the data to the backend
    showSuccess("Customer added successfully!");

    console.log("Customer information:");
    console.log("Name:", name);
    console.log("Address:", address);
    console.log("Phone:", phone);
    console.log("Email:", email);

    form.reset();
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