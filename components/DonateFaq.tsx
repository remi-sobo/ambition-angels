"use client";

import { useState } from "react";

const faqs = [
  {
    question: "How do I make a gift?",
    answer:
      "Online at this page, or by emailing our philanthropy team at shannon@ambitionangels.org. Checks can be made payable to Ambition Angels and mailed to 380 Portage Ave., Palo Alto, CA 94306. Contact us for wire transfer details.",
  },
  {
    question: "Can I choose what my donation supports?",
    answer:
      "We cannot always guarantee designation, but every gift over $100,000 opens a direct conversation with our philanthropy team about your giving options and the specific impact they will have.",
  },
  {
    question: "Is Ambition Angels tax-exempt?",
    answer:
      "Yes. We are a 501(c)(3) nonprofit organization. Your gift is tax-deductible to the extent allowed by law. Tax ID: 87-2513010.",
  },
  {
    question: "Who supports Ambition Angels?",
    answer:
      "Mission-minded individuals, foundations, companies, and community members who believe in closing the opportunity gap for low-income teens. We are grateful for every one of them.",
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
