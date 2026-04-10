"use client";

import { useState } from "react";

const faqs = [
  {
    question: "How do I make a gift?",
    answer:
      "You can donate online or by emailing our philanthropy team at shannon@ambitionangels.org. You can also donate by mail — checks can be made payable to Ambition Angels and mailed to: 380 Portage Ave., Palo Alto, CA 94306. For wire transfers: Beneficiary: Ambition Angels · Bank: Wells Fargo Bank, N.A. · Routing: 121000248 · Account: 2245119926 · Bank address: 420 Montgomery, San Francisco, CA 94104 · Tax ID: 87-2513010.",
  },
  {
    question: "Can I choose what my donation supports?",
    answer:
      "While we cannot promise you can always choose where your donation goes, we can promise that every $100K+ gift warrants a conversation with our philanthropy team where you will learn about your giving opportunities and the impact they will have.",
  },
  {
    question: "Is Ambition Angels tax-exempt?",
    answer:
      "Yes, Ambition Angels is a 501(c)(3) tax-exempt organization. Your gift is deductible to the extent allowed by law. Our tax ID number is 87-2513010.",
  },
  {
    question: "Who supports Ambition Angels?",
    answer:
      "Ambition Angels partners with mission-minded individuals and foundations whose support funds our work. We are grateful for our partners and their commitment to supporting low-income, Black and brown teens.",
  },
];

export default function DonateFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {faqs.map((faq, i) => {
        const isOpen = openIndex === i;
        return (
          <div
            key={faq.question}
            className="border border-gray-light rounded-card overflow-hidden bg-white"
          >
            <button
              className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left font-heading font-semibold text-ink hover:text-orange transition-colors"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
            >
              <span>{faq.question}</span>
              <span
                className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-light flex items-center justify-center transition-transform duration-200"
                style={{ transform: isOpen ? "rotate(45deg)" : "rotate(0deg)" }}
                aria-hidden="true"
              >
                <svg
                  className="w-3 h-3 text-orange"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </span>
            </button>
            {isOpen && (
              <div className="px-6 pb-6 text-gray-warm leading-relaxed text-base border-t border-gray-light pt-4">
                {faq.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
