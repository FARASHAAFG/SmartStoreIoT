from email.message import EmailMessage
import smtplib
import imaplib
import email

sender_email = "jiayu.joyho@gmail.com"
user_email = "jiayu.joyho@gmail.com"   # the person who gets the alert and replies

password = None   # set by app.py when it starts


def send_alert(fridge, temperature):
    msg = EmailMessage()
    msg["From"] = sender_email
    msg["To"] = user_email
    msg["Subject"] = f"Fan alert {fridge}"
    msg.set_content(
        f"The current temperature is {temperature} °C. Would you like to turn on the fan?\n"
        f"Reply YES to turn it on."
    )

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(sender_email, password)
        server.send_message(msg)

    print(f"Alert email sent for {fridge}")


def get_body(msg):
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                return part.get_payload(decode=True).decode(errors="replace")
        return ""

    return msg.get_payload(decode=True).decode(errors="replace")


def get_replies(fridge):
    replies = {}

    with imaplib.IMAP4_SSL("imap.gmail.com", 993) as mail:
        mail.login(sender_email, password)
        mail.select("INBOX")

        status, messages = mail.search(None, "FROM", f'"{user_email}"', "SUBJECT", f'"Fan alert {fridge}"')

        for email_id in messages[0].split():
            # BODY.PEEK reads the email without marking it as read
            status, msg_data = mail.fetch(email_id, "(BODY.PEEK[])")
            msg = email.message_from_bytes(msg_data[0][1])

            # Skip the alert itself, only keep replies ("Re: Fan alert Frig1")
            if not msg["Subject"].lower().startswith("re:"):
                continue

            # The first line of the reply is what the user typed (YES or something else)
            lines = get_body(msg).strip().splitlines()
            replies[email_id] = lines[0].strip() if lines else ""

    return replies
