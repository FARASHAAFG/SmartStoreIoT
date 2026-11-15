
import os
import smtplib
from email.message import EmailMessage


def send_purchase_receipt(
    recipient_email,
    customer_name,
    transaction_id,
    sale_date,
    total,
    points_earned,
    items,
    membership_number=None
):
    """
    Send a purchase receipt to a registered SmartStore customer.
    """

    # Read Gmail credentials from environment variables.
    sender_email = os.environ.get("SMARTSTORE_EMAIL_ADDRESS")
    app_password = os.environ.get("SMARTSTORE_EMAIL_APP_PASSWORD")

    if not sender_email or not app_password:
        raise RuntimeError("SmartStore email credentials are not configured.")

    # Construct the email.
    msg = EmailMessage()

    msg["From"] = sender_email
    msg["To"] = recipient_email
    msg["Subject"] = f"Your SmartStore Purchase Receipt #{transaction_id}"

    # Build the receipt body.
    receipt_lines = [
        f"Hello {customer_name},",
        "",
        "Thank you for shopping with SmartStore!",
        "Here is your purchase receipt.",
        "",
        f"Transaction Number: #{transaction_id}",
        f"Date: {sale_date}",
    ]

    if membership_number:
        receipt_lines.append(
            f"Membership Number: {membership_number}"
        )

    receipt_lines.extend([
        "",
        "PURCHASED PRODUCTS",
        "------------------"
    ])

    for item in items:
        name = item["name"]
        quantity = item["quantity"]
        price = item["price"]
        line_total = item["line_total"]

        receipt_lines.append(
            f"{name} x {quantity} "
            f"@ ${price:.2f} = ${line_total:.2f}"
        )

    receipt_lines.extend([
        "",
        "------------------",
        f"Total Paid: ${total:.2f}",
        f"Loyalty Points Earned: {points_earned}",
        "",
        "Thank you for shopping with SmartStore!",
        "We hope to see you again.",
        "",
        "SmartStore IoT"
    ])

    msg.set_content("\n".join(receipt_lines))

    # Send the email using Gmail SMTP.
    with smtplib.SMTP_SSL(
        "smtp.gmail.com",
        465,
        timeout=20
    ) as server:

        server.login(sender_email, app_password)
        server.send_message(msg)

    print(
        f"Purchase receipt #{transaction_id} "
        f"sent to {recipient_email}"
    )
