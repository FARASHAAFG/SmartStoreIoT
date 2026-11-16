import os
import unittest
from unittest.mock import patch

from email_receipt import send_purchase_receipt


class ReceiptTest(unittest.TestCase):
    @patch.dict(os.environ, {
        "SMARTSTORE_EMAIL_ADDRESS": "sender@example.com",
        "SMARTSTORE_EMAIL_APP_PASSWORD": "fake-for-this-test",
    })
    @patch("email_receipt.smtplib.SMTP_SSL")
    def test_builds_and_sends_receipt(self, smtp_ssl):
        send_purchase_receipt(
            recipient_email="customer@example.com",
            customer_name="Email Test",
            transaction_id=123,
            sale_date="2026-11-15T12:00:00+00:00",
            total=3.50,
            points_earned=3,
            items=[{
                "name": "Test product",
                "quantity": 1,
                "price": 3.50,
                "line_total": 3.50,
            }],
            membership_number="SS-TEST",
        )

        smtp_ssl.assert_called_once_with("smtp.gmail.com", 465, timeout=20)
        server = smtp_ssl.return_value.__enter__.return_value
        server.login.assert_called_once_with(
            "sender@example.com", "fake-for-this-test"
        )
        server.send_message.assert_called_once()

        message = server.send_message.call_args[0][0]
        body = message.get_content()

        self.assertEqual(message["To"], "customer@example.com")
        self.assertIn("123", message["Subject"])
        self.assertIn("Hello Email Test", body)
        self.assertIn("Test product x 1", body)
        self.assertIn("$3.50", body)
        self.assertIn("SS-TEST", body)


if __name__ == "__main__":
    unittest.main()