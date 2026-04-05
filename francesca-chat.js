/**
 * Francesca Chat — Chatbot Widget for francescapmu.com
 * Permanent Makeup by Francesca Scognamiglio
 *
 * AI-powered chatbot with OpenAI integration and local fallback.
 * Uses a server-side API for intelligent responses; falls back to
 * built-in keyword matching when the API is unavailable.
 *
 * Usage: Add <script src="francesca-chat.js"></script> before </body>
 */

(function () {
  "use strict";

  /* ─────────────────────── API CONFIGURATION ─────────────────────── */

  /**
   * API endpoint URL. Uses relative path when hosted on same Vercel domain.
   * For cross-domain embedding (e.g. WordPress), set the full URL:
   *   "https://your-project.vercel.app/api/chat"
   * Leave empty string "" to use only the local keyword matcher.
   */
  const API_URL = (window.location.hostname.includes("francescapmu") ? "https://francesca-chat-jordan-lovelaces-projects.vercel.app" : "") + "/api/chat";

  /** Base URL for API calls (auto-detected for cross-domain). */
  const API_BASE = window.location.hostname.includes("francescapmu")
    ? "https://francesca-chat-jordan-lovelaces-projects.vercel.app"
    : "";
  const POLL_URL = API_BASE + "/api/poll";
  const TRACK_URL = API_BASE + "/api/track";

  /** Conversation history sent to the API for context. */
  let conversationHistory = [];

  /** Max history pairs to send (keeps token usage reasonable). */
  const MAX_HISTORY = 20;

  /** Session ID for tracking conversations (persisted in localStorage). */
  let sessionId = localStorage.getItem("fc_session_id") || "";
  if (!sessionId) {
    sessionId = "fc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
    localStorage.setItem("fc_session_id", sessionId);
  }

  /** Polling state for operator messages. */
  let pollTimer = null;
  let lastPollTime = "";
  let isOperatorMode = false;

  /** Send GA4 event (works if gtag is on the page, silently skips otherwise). */
  function trackEvent(eventName, params) {
    try { if (window.gtag) window.gtag("event", eventName, params); } catch(_) {}
  }

  /* ───────────────────────────── KNOWLEDGE BASE ───────────────────────────── */

  const KB = {
    business: {
      name: "Permanent Makeup by Francesca",
      owner: "Francesca Scognamiglio",
      phone: "(951) 733-2225",
      email: "Info@francescapmu.com",
      address: "1920 E Katella Ave Ste P, Orange, CA 92867",
      website: "https://francescapmu.com",
      booking: "https://francescapmu.com/booking/",
      consultation: "https://francescapmu.com/consultation",
      gallery: "https://francescapmu.com/gallery/",
      faq: "https://francescapmu.com/faq/",
      testimonials: "https://francescapmu.com/testimonials",
      giftCertificates: "https://francescapmu.com/gift-certificates/",
      paymentPlans: "https://francescapmu.com/payment-plans/",
      mission:
        "Our mission is to make our clients feel their absolute best 24 hours a day, 7 days a week. Giving the gift of confidence and ensuring their look is as polished and perfect as they are. Whether we are reversing years of overplucking or offering our knowledge of skincare, we do our part to give our clients an exceptional experience.",
      hours: "Please call us at (951) 733-2225 or visit our booking page for current availability.",
      social: {
        instagram: "https://www.instagram.com/francescapermanentmakeup/",
        facebook: "https://www.facebook.com/francescapermanentmakeup",
        tiktok:
          "https://www.tiktok.com/@francescapermanentmakeup",
        youtube:
          "https://www.youtube.com/channel/UCJKuIHu8MQ48NsZ9M89zuvw",
      },
    },

    about:
      "Francesca is the owner, founder, and lead permanent makeup artist & educator. Born in Italy, raised in New Jersey until age 8, then back to Italy until 2015. She and her husband Frank brought their business to Orange, California, opening the first Studio and Academy in Orange, CA. Francesca has over 18 years of Permanent Makeup (PMU) experience. She was the 2019 CPCP speaker at the SPCP fall conference, presenting her digital eyebrow hair stroke technique, and won Best Speaker. She is also a busy mother to three beautiful boys.",

    certifications: [
      "2010 — Certification in Permanent Makeup",
      "2011 — Advanced Permanent Makeup Certification",
      "2013 — Hyper Realistic Eyebrows Masterclass (Ennio Orsini)",
      "2014 — Advanced Hyper Realistic Eyebrows Masterclass (Ennio Orsini)",
      "2016 — Understanding Color Theory and Skin Undertones Masterclass",
      "2017 — Smokey Eyelash Enhancement®️ Training",
      "2018 — Member of SPCP Society of Permanent Cosmetic Professionals",
      "2018 — VMM®️ Areola Masterclass",
      "2019 — CPCP Title 'Certified Permanent Cosmetic Professional'",
      "2019 — Master's Hands Masterclass",
      "2020 — Velvet Eyeliner Masterclass",
      "2020 — Perfect Brow Masterclass",
      "2020 — Shaded Eyeliner Masterclass",
      "2020 — Advanced Beauty College: 600 hours aesthetics education",
      "2021 — Magic Shading Eyeliner Mara Pro",
      "2023 — Velvet Lips Masterclass Mara Pro",
      "2023 — Sculpted Lips Pigmentology by Sculpted",
      "2023 — Science behind the pigment PermaYou",
      "2024 — Sculpted Eyebrows Pigmentology",
      "2024 — Holistic Skincare Specialist & Wellness Coach",
    ],

    services: {
      eyebrows: {
        name: "Eyebrows",
        url: "https://francescapmu.com/eyebrows/",
        description:
          "We offer a range of permanent eyebrow techniques including microblading, powder brows, combination brows, and hyper-realistic hair strokes. Francesca will recommend the best technique for your skin type and desired look.",
      },
      eyeliner: {
        name: "Eyeliner",
        url: "https://francescapmu.com/eyeliner/",
        description:
          "Permanent eyeliner services including lash enhancement, classic eyeliner, and smokey eyeliner. Wake up every day with perfectly defined eyes.",
      },
      lips: {
        name: "Lips",
        url: "https://francescapmu.com/lips/",
        description:
          "Lip blushing and permanent lip color to enhance your natural lip shape and add beautiful, long-lasting color.",
      },
      tattooLightening: {
        name: "Tattoo Lightening",
        url: "https://francescapmu.com/removal/",
        description:
          "Non-laser tattoo lightening treatments to correct or remove unwanted permanent makeup or small tattoos.",
      },
      proCellTherapy: {
        name: "Pro Cell Therapy",
        url: "https://francescapmu.com/procell/",
        description:
          "ProCell Microchanneling therapy stimulates your body's natural collagen production. Great for fine lines, acne scars, and overall skin rejuvenation.",
      },
    },

    products: {
      osmosis: {
        name: "Osmosis Beauty",
        url: "https://francescapmu.com/osmosis/",
        description:
          "We are an authorized Osmosis Beauty retailer offering a full range of professional skincare and makeup products. Free shipping on orders over $150!",
        categories: [
          "Cleansers",
          "Serums",
          "Mists",
          "Masks",
          "Eye Care",
          "Moisturizers",
          "Body Care",
          "Facial Tools",
          "Kits",
          "Makeup (Face, Eyes + Lips, Beauty Tools)",
        ],
        skinTypes: [
          "Oncology Friendly",
          "Blemish-Prone & Oily",
          "Fine Lines & Wrinkles",
          "Dry / Winter Skin",
          "Texture",
          "Redness & Irritation",
          "Pigmented",
          "Blackheads",
        ],
      },
      grande: {
        name: "Grande Cosmetics",
        url: "https://francescapmu.com/grande-cosmetics/",
        description:
          "Grande Cosmetics products for lash and brow enhancement, lip plumping, and more.",
      },
      lightstim: {
        name: "LightStim LED",
        url: "https://francescapmu.com/grande-cosmetics-copy/",
        description:
          "LightStim LED light therapy devices for anti-aging, acne treatment, and pain relief.",
      },
    },

    policies: {
      careInstructions:
        "Before & aftercare instructions are available at https://francescapmu.com/care-instructions/. Following these instructions is crucial for the best results.",
      policy:
        "Our full studio policy can be found at https://francescapmu.com/policy/.",
      returns: "Our return policy is available at https://francescapmu.com/returns/.",
      privacy: "Our privacy policy is available at https://francescapmu.com/privacy/.",
      terms: "Our terms and conditions are available at https://francescapmu.com/terms/.",
    },

    training: {
      academy:
        "Francesca's Academy offers professional permanent makeup training. In-person training is coming soon! Visit https://francescapmu.com/academy/ for updates.",
      online:
        "Online training is available now! Start your permanent makeup education from anywhere. Visit https://francescapmu.podia.com/retone to get started.",
    },

    testimonials: [
      {
        name: "Aliza A.",
        text: "She is truly amazing! So happy with my results. She recommended I do powder brows for the bottom part + microblading technique on the inner and upper part of my brows. Excited to be back for my touch up because I want to go a tad darker but overall so worth it!!",
      },
      {
        name: "Viktoria M.",
        text: "Omg, I absolutely love my brows, I am so happy with the outcome. It has saved me 15 minutes on my daily makeup routine. Francesca is truly an artist. I highly recommended using her.",
      },
      {
        name: "Kindel N.",
        text: "Francesca changed my life! What she did for me cannot be measured with words. I am a perfectionist and so is Francesca. When I first saw what she did, I cried big giant crocodile tears of joy. She has given me back so much time. It really is priceless.",
      },
    ],

    faq: [
      {
        q: "How long does permanent makeup last?",
        a: "Permanent makeup typically lasts 1-3 years depending on the technique, your skin type, and lifestyle. A touch-up is recommended every 12-18 months to maintain optimal results.",
      },
      {
        q: "Does permanent makeup hurt?",
        a: "We use topical numbing cream to minimize discomfort. Most clients describe the sensation as mild pressure or a slight scratching feeling. Francesca prioritizes your comfort throughout the entire procedure.",
      },
      {
        q: "How long is the healing process?",
        a: "Initial healing takes about 7-14 days. The full healing cycle is approximately 4-6 weeks. During this time, you'll follow our aftercare instructions carefully. The color will appear darker initially and will soften as it heals.",
      },
      {
        q: "Do I need a touch-up?",
        a: "Yes, a touch-up session is typically scheduled 6-8 weeks after the initial appointment. This allows us to perfect the shape, color, and density once the skin has fully healed.",
      },
      {
        q: "What should I do before my appointment?",
        a: "Please visit our Before & Aftercare page at https://francescapmu.com/care-instructions/ for detailed preparation instructions. Generally, avoid blood thinners, alcohol, and caffeine 24-48 hours before your appointment.",
      },
      {
        q: "Do you offer payment plans?",
        a: "Yes! We offer payment plans to make our services more accessible. Visit https://francescapmu.com/payment-plans/ for more details.",
      },
      {
        q: "Do you offer gift certificates?",
        a: "Yes! Gift certificates are available and make a wonderful present. Visit https://francescapmu.com/gift-certificates/ to purchase one.",
      },
      {
        q: "What is ProCell Therapy?",
        a: "ProCell Microchanneling is an advanced skin rejuvenation treatment that stimulates your body's natural collagen production. It's excellent for fine lines, acne scars, stretch marks, and overall skin improvement. Learn more at https://francescapmu.com/procell/.",
      },
    ],
  };

  /* ──────────────────────── RESPONSE ENGINE ──────────────────────── */

  /**
   * Simple keyword/intent matcher — returns a formatted reply.
   */
  function getReply(input) {
    const q = input.toLowerCase().trim();

    // Greetings
    if (/^(hi|hello|hey|howdy|good\s*(morning|afternoon|evening)|ciao|hola|greetings)/i.test(q)) {
      return `Hello! 👋 Welcome to **Francesca Chat**! I'm here to help you learn about our permanent makeup services, skincare products, and more.\n\nHow can I assist you today? Here are some things I can help with:\n• 💄 **Services** — Eyebrows, Eyeliner, Lips, & more\n• 🛍️ **Products** — Osmosis Beauty, Grande Cosmetics, LightStim\n• 📅 **Booking** — Schedule an appointment\n• ❓ **FAQ** — Common questions answered\n• 📞 **Contact** — Get in touch with us`;
    }

    // Booking / Appointment
    if (/book|appointment|schedule|reserv|consult/i.test(q)) {
      if (/consult|free|upload|photo/i.test(q)) {
        return `We offer **free consultations**! You can upload a photo and we'll get back to you with our best advice.\n\n📸 [Upload Photos for Free Consultation](${KB.business.consultation})\n\nOr call us directly at **${KB.business.phone}** to discuss your goals!`;
      }
      return `We'd love to see you! 📅\n\n👉 [**Book Your Appointment**](${KB.business.booking})\n\nYou can also call us at **${KB.business.phone}** to schedule.\n\n💡 *Tip: Check out our [Before & Aftercare](https://francescapmu.com/care-instructions/) page before your visit!*`;
    }

    // Services — Eyebrows
    if (/eyebrow|brow|microblad|powder\s*brow|combo\s*brow|hair\s*stroke/i.test(q)) {
      return `## ✨ Eyebrow Services\n\n${KB.services.eyebrows.description}\n\n**Techniques we offer:**\n• Microblading\n• Powder Brows\n• Combination Brows\n• Hyper-Realistic Hair Strokes\n\n👉 [Learn More About Eyebrows](${KB.services.eyebrows.url})\n📅 [Book Now](${KB.business.booking}) | 📸 [Free Consultation](${KB.business.consultation})`;
    }

    // Services — Eyeliner
    if (/eyeliner|lash\s*(enhance|line)|eye\s*line/i.test(q)) {
      return `## ✨ Eyeliner Services\n\n${KB.services.eyeliner.description}\n\n**Options include:**\n• Lash Enhancement\n• Classic Eyeliner\n• Smokey Eyeliner\n\n👉 [Learn More About Eyeliner](${KB.services.eyeliner.url})\n📅 [Book Now](${KB.business.booking})`;
    }

    // Services — Lips
    if (/\blips?\b|lip\s*blush|lip\s*color|lip\s*tint/i.test(q)) {
      return `## 💋 Lip Services\n\n${KB.services.lips.description}\n\n👉 [Learn More About Lips](${KB.services.lips.url})\n📅 [Book Now](${KB.business.booking})`;
    }

    // Services — Tattoo Lightening / Removal
    if (/tattoo|lighten|removal|remove|correct/i.test(q)) {
      return `## Tattoo Lightening\n\n${KB.services.tattooLightening.description}\n\n👉 [Learn More](${KB.services.tattooLightening.url})\n📅 [Book a Consultation](${KB.business.booking})`;
    }

    // Services — ProCell
    if (/procell|micro\s*channel|collagen|skin\s*rejuv/i.test(q)) {
      return `## 🧬 ProCell Therapy\n\n${KB.services.proCellTherapy.description}\n\n👉 [Learn More About ProCell](${KB.services.proCellTherapy.url})\n📅 [Book Now](${KB.business.booking})`;
    }

    // All services overview
    if (/service|what\s*(do\s*you|can\s*you)\s*(do|offer)|treatment|procedure|menu/i.test(q)) {
      return `## 💄 Our Services\n\nWe offer a full range of permanent makeup and skincare services:\n\n• **[Eyebrows](${KB.services.eyebrows.url})** — Microblading, Powder Brows, Combo, Hair Strokes\n• **[Eyeliner](${KB.services.eyeliner.url})** — Lash Enhancement, Classic, Smokey\n• **[Lips](${KB.services.lips.url})** — Lip Blushing & Permanent Lip Color\n• **[Tattoo Lightening](${KB.services.tattooLightening.url})** — Non-laser correction & removal\n• **[ProCell Therapy](${KB.services.proCellTherapy.url})** — Microchanneling & collagen stimulation\n\n📅 [**Book an Appointment**](${KB.business.booking}) | 📸 [Free Consultation](${KB.business.consultation})`;
    }

    // Products — Osmosis
    if (/osmosis|skincare|skin\s*care|cleanser|serum|mist|mask|moisturiz|body\s*care/i.test(q)) {
      return `## 🧴 Osmosis Beauty\n\n${KB.products.osmosis.description}\n\n**Skincare Categories:**\n${KB.products.osmosis.categories.map((c) => `• ${c}`).join("\n")}\n\n**Shop by Skin Type:**\n${KB.products.osmosis.skinTypes.map((s) => `• ${s}`).join("\n")}\n\n🛒 [**Shop Osmosis Beauty**](${KB.products.osmosis.url})\n\n🚚 *Free shipping on orders over $150!*`;
    }

    // Products — Grande
    if (/grande|lash\s*growth|brow\s*growth|lip\s*plump/i.test(q)) {
      return `## ✨ Grande Cosmetics\n\n${KB.products.grande.description}\n\n🛒 [**Shop Grande Cosmetics**](${KB.products.grande.url})`;
    }

    // Products — LightStim
    if (/lightstim|led|light\s*therapy/i.test(q)) {
      return `## 💡 LightStim LED\n\n${KB.products.lightstim.description}\n\n🛒 [**Shop LightStim**](${KB.products.lightstim.url})`;
    }

    // Products overview
    if (/product|shop|store|buy|purchase|order/i.test(q)) {
      return `## 🛍️ Our Products\n\nWe carry premium beauty and skincare brands:\n\n• **[Osmosis Beauty](${KB.products.osmosis.url})** — Full skincare & makeup line\n• **[Grande Cosmetics](${KB.products.grande.url})** — Lash, brow & lip enhancers\n• **[LightStim LED](${KB.products.lightstim.url})** — LED light therapy devices\n\n🚚 *Free shipping on Osmosis Beauty orders over $150!*\n🎁 [Gift Certificates Available](${KB.business.giftCertificates})`;
    }

    // Pricing
    if (/price|cost|how\s*much|pric|rate|fee|afford/i.test(q)) {
      return `For detailed pricing, we recommend booking a **free consultation** so Francesca can assess your needs and recommend the best approach.\n\n📸 [Free Consultation](${KB.business.consultation})\n📅 [Book Appointment](${KB.business.booking})\n📞 Call us: **${KB.business.phone}**\n\n💳 We also offer [**Payment Plans**](${KB.business.paymentPlans}) to make services more accessible!`;
    }

    // Payment Plans
    if (/payment\s*plan|financ|pay\s*later|install/i.test(q)) {
      return `Yes! We offer **payment plans** to make our services more accessible. 💳\n\n👉 [**Learn About Payment Plans**](${KB.business.paymentPlans})\n\nOr call us at **${KB.business.phone}** for details.`;
    }

    // Gift Certificates
    if (/gift|certif|voucher|present/i.test(q)) {
      return `🎁 **Gift Certificates** are available and make a wonderful present!\n\n👉 [**Purchase a Gift Certificate**](${KB.business.giftCertificates})\n\nGive the gift of confidence to someone special!`;
    }

    // About Francesca
    if (/about|francesca|who\s*(is|are)|owner|founder|artist|background|story|bio/i.test(q)) {
      return `## 👩‍🎨 About Francesca\n\n${KB.about}\n\n**Certifications include:**\n${KB.certifications.slice(0, 6).map((c) => `• ${c}`).join("\n")}\n• ...and many more!\n\n📖 [Visit Our Website](${KB.business.website}) to learn more.`;
    }

    // Certifications
    if (/certif|credential|qualif|train(ed|ing)|education/i.test(q)) {
      if (/your|francesca|her/i.test(q) || /certif|credential|qualif/i.test(q)) {
        return `## 📜 Francesca's Certifications\n\n${KB.certifications.map((c) => `• ${c}`).join("\n")}\n\nFrancesca was also the **2019 CPCP Best Speaker** at the SPCP fall conference! 🏆`;
      }
      // Training for students
      return `## 🎓 Training & Education\n\n**In-Person Training:** ${KB.training.academy}\n\n**Online Training:** ${KB.training.online}\n\n📚 [Start Online Training](https://francescapmu.podia.com/retone)`;
    }

    // Academy / Training
    if (/academy|class|learn|course|student|teach|become/i.test(q)) {
      return `## 🎓 Training & Academy\n\n**In-Person Academy:** ${KB.training.academy}\n\n**Online Training:** ${KB.training.online}\n\n📚 [**Start Online Training Now**](https://francescapmu.podia.com/retone)`;
    }

    // Contact
    if (/contact|reach|call|phone|email|address|locat|where|find\s*us|direct/i.test(q)) {
      return `## 📞 Contact Us\n\n**Phone:** ${KB.business.phone}\n**Email:** ${KB.business.email}\n**Address:** ${KB.business.address}\n\n**Follow Us:**\n• [Instagram](${KB.business.social.instagram})\n• [Facebook](${KB.business.social.facebook})\n• [TikTok](${KB.business.social.tiktok})\n• [YouTube](${KB.business.social.youtube})\n\n📅 [Book Online](${KB.business.booking}) | 📸 [Free Consultation](${KB.business.consultation})`;
    }

    // Hours
    if (/hour|open|close|when\s*are|avail|time/i.test(q)) {
      return `${KB.business.hours}\n\n📅 [**Book Online**](${KB.business.booking}) to see available time slots.\n📞 Or call us at **${KB.business.phone}**.`;
    }

    // Testimonials / Reviews
    if (/testimon|review|what\s*(do|did)\s*(people|client|customer)|feedback|result/i.test(q)) {
      const t = KB.testimonials;
      return `## ⭐ What Our Clients Say\n\n${t.map((r) => `**${r.name}** ⭐⭐⭐⭐⭐\n*"${r.text}"*`).join("\n\n")}\n\n👉 [**Read More Testimonials**](${KB.business.testimonials})`;
    }

    // Gallery
    if (/gallery|photo|picture|portfolio|before\s*(and|&)\s*after|result|work/i.test(q)) {
      return `📸 Check out our gallery to see real results!\n\n👉 [**View Our Gallery**](${KB.business.gallery})\n\nYou can also follow us on [Instagram](${KB.business.social.instagram}) for daily updates!`;
    }

    // Healing / Aftercare
    if (/heal|aftercare|after\s*care|recover|care\s*instruct|before\s*care/i.test(q)) {
      return `## 🩹 Before & Aftercare\n\nProper care before and after your appointment is essential for the best results!\n\n👉 [**View Full Care Instructions**](https://francescapmu.com/care-instructions/)\n\n**General Tips:**\n• Avoid blood thinners, alcohol & caffeine 24-48 hours before\n• Keep the area clean and dry during healing\n• Initial healing: 7-14 days; Full cycle: 4-6 weeks\n• Color will appear darker initially and soften as it heals`;
    }

    // Pain / Hurt
    if (/pain|hurt|does\s*it\s*hurt|comfort|numb/i.test(q)) {
      return `We use **topical numbing cream** to minimize discomfort. Most clients describe the sensation as mild pressure or a slight scratching feeling. Francesca prioritizes your comfort throughout the entire procedure. 😊\n\nHave more questions? Visit our [FAQ](${KB.business.faq}) or call us at **${KB.business.phone}**.`;
    }

    // How long does it last
    if (/how\s*long|last|duration|permanent|fade|touch\s*up/i.test(q)) {
      return `Permanent makeup typically lasts **1-3 years** depending on the technique, your skin type, and lifestyle.\n\nA **touch-up** is recommended every 12-18 months to maintain optimal results. Your first touch-up is usually scheduled 6-8 weeks after the initial appointment.\n\n📅 [Book Now](${KB.business.booking}) | ❓ [Full FAQ](${KB.business.faq})`;
    }

    // FAQ
    if (/faq|frequently|common\s*question|question/i.test(q)) {
      return `## ❓ Frequently Asked Questions\n\n${KB.faq.map((f) => `**Q: ${f.q}**\nA: ${f.a}`).join("\n\n")}\n\n👉 [**Visit Full FAQ Page**](${KB.business.faq})`;
    }

    // Policy
    if (/policy|return|refund|cancel|privacy|terms/i.test(q)) {
      return `## 📋 Policies\n\n• [Before & Aftercare](https://francescapmu.com/care-instructions/)\n• [Studio Policy](https://francescapmu.com/policy/)\n• [Return Policy](https://francescapmu.com/returns/)\n• [Privacy Policy](https://francescapmu.com/privacy/)\n• [Terms & Conditions](https://francescapmu.com/terms/)\n\nQuestions? Call us at **${KB.business.phone}**.`;
    }

    // Shipping
    if (/ship|deliver|free\s*ship/i.test(q)) {
      return `🚚 **Free shipping** on Osmosis Beauty orders over **$150**!\n\n🛒 [Shop Osmosis Beauty](${KB.products.osmosis.url})`;
    }

    // Social media
    if (/social|instagram|facebook|tiktok|youtube|follow/i.test(q)) {
      return `## 📱 Follow Us!\n\n• 📷 [Instagram](${KB.business.social.instagram})\n• 📘 [Facebook](${KB.business.social.facebook})\n• 🎵 [TikTok](${KB.business.social.tiktok})\n• ▶️ [YouTube](${KB.business.social.youtube})\n\nFollow for daily inspiration, before & afters, and behind-the-scenes content!`;
    }

    // Thank you
    if (/thank|thanks|thx|appreciate|helpful/i.test(q)) {
      return `You're so welcome! 💛 If you have any other questions, I'm here to help.\n\n📅 [Book Appointment](${KB.business.booking}) | 📞 ${KB.business.phone}`;
    }

    // Goodbye
    if (/bye|goodbye|see\s*you|later|good\s*night|take\s*care/i.test(q)) {
      return `Goodbye! 👋 Thank you for chatting with us. We look forward to seeing you at the studio!\n\n📞 ${KB.business.phone}\n📅 [Book Anytime](${KB.business.booking})`;
    }

    // Mission
    if (/mission|value|believe|philosophy|why/i.test(q)) {
      return `## 💛 Our Mission\n\n*"${KB.business.mission}"*\n\n📅 [Book Your Experience](${KB.business.booking})`;
    }

    // Skin type recommendation
    if (/skin\s*type|oily|dry|acne|blemish|wrinkle|redness|pigment|blackhead|sensitive|texture/i.test(q)) {
      return `We can help you find the right skincare for your skin type! Osmosis Beauty has solutions for:\n\n${KB.products.osmosis.skinTypes.map((s) => `• ${s}`).join("\n")}\n\n🛒 [**Shop by Skin Type**](${KB.products.osmosis.url})\n\nNot sure what you need? Call us at **${KB.business.phone}** for a personalized recommendation!`;
    }

    // MD Advanced
    if (/md\s*advanced|medical|doctor/i.test(q)) {
      return `## 🔬 MD Advanced\n\nDiscover our MD Advanced line and skin condition protocols for targeted skincare solutions.\n\n👉 [MD Advanced](https://francescapmu.com/md-advanced/)\n👉 [Skin Condition Protocols](https://francescapmu.com/skin-condition-protocols/)`;
    }

    // Fallback
    return `I appreciate your question! While I may not have the specific answer right now, I can help with:\n\n• 💄 **Services** — Eyebrows, Eyeliner, Lips, ProCell\n• 🛍️ **Products** — Osmosis, Grande Cosmetics, LightStim\n• 📅 **Booking** — Schedule an appointment\n• 📞 **Contact** — Reach us directly\n• ❓ **FAQ** — Common questions\n\nOr contact us directly:\n📞 **${KB.business.phone}**\n📧 **${KB.business.email}**\n📅 [Book Online](${KB.business.booking})`;
  }

  /* ─────────────────── SIMPLE MARKDOWN RENDERER ─────────────────── */

  function renderMarkdown(text) {
    let html = text
      // headings
      .replace(/^## (.+)$/gm, '<h3 class="fc-md-h">$1</h3>')
      // bold
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // italic
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      // links  [text](url)
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>'
      )
      // unordered list items
      .replace(/^• (.+)$/gm, '<li class="fc-li">$1</li>')
      // line breaks
      .replace(/\n/g, "<br>");

    // wrap consecutive <li> in <ul>
    html = html.replace(
      /(<li class="fc-li">.*?<\/li>(<br>)?)+/g,
      (match) => `<ul class="fc-ul">${match.replace(/<br>/g, "")}</ul>`
    );

    return html;
  }

  /* ─────────────────────── UI CONSTRUCTION ─────────────────────── */

  const COLORS = {
    primary: "#ab7759",
    primaryDark: "#8e5f43",
    gold: "#c9a96e",
    white: "#ffffff",
    lightBg: "#faf6f2",
    text: "#333333",
    textLight: "#757575",
    border: "#e8ddd3",
  };

  function injectStyles() {
    const css = `
      /* ── Francesca Chat Widget ── */
      #fc-chat-launcher {
        position: fixed; bottom: 24px; right: 24px; z-index: 999999;
        width: 60px; height: 60px; border-radius: 50%;
        background: linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark});
        border: none; cursor: pointer; box-shadow: 0 4px 16px rgba(171,119,89,.45);
        display: flex; align-items: center; justify-content: center;
        transition: transform .25s ease, box-shadow .25s ease;
      }
      #fc-chat-launcher:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(171,119,89,.55); }
      #fc-chat-launcher svg { width: 28px; height: 28px; fill: ${COLORS.white}; }
      #fc-chat-launcher .fc-close-icon { display: none; }
      #fc-chat-launcher.fc-open .fc-chat-icon { display: none; }
      #fc-chat-launcher.fc-open .fc-close-icon { display: block; }

      #fc-chat-badge {
        position: absolute; top: -2px; right: -2px;
        background: #e74c3c; color: #fff; font-size: 11px; font-weight: 700;
        width: 20px; height: 20px; border-radius: 50%; display: flex;
        align-items: center; justify-content: center; pointer-events: none;
      }
      #fc-chat-badge.fc-hidden { display: none; }

      #fc-chat-window {
        position: fixed; bottom: 96px; right: 24px; z-index: 999998;
        width: 380px; max-width: calc(100vw - 32px);
        height: 560px; max-height: calc(100vh - 130px);
        background: ${COLORS.white}; border-radius: 16px;
        box-shadow: 0 12px 48px rgba(0,0,0,.18);
        display: none; flex-direction: column;
        overflow: hidden; font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        animation: fc-slide-up .3s ease;
      }
      #fc-chat-window.fc-visible { display: flex; }

      @keyframes fc-slide-up {
        from { opacity: 0; transform: translateY(16px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* Header */
      .fc-header {
        background: linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark});
        color: ${COLORS.white}; padding: 16px 20px;
        display: flex; align-items: center; gap: 12px; flex-shrink: 0;
      }
      .fc-header-avatar {
        width: 40px; height: 40px; border-radius: 50%;
        background: rgba(255,255,255,.2); display: flex;
        align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;
      }
      .fc-header-info { flex: 1; }
      .fc-header-name { font-weight: 700; font-size: 15px; }
      .fc-header-status { font-size: 12px; opacity: .85; margin-top: 2px; }

      /* Messages area */
      .fc-messages {
        flex: 1; overflow-y: auto; padding: 16px; display: flex;
        flex-direction: column; gap: 12px; background: ${COLORS.lightBg};
      }
      .fc-messages::-webkit-scrollbar { width: 5px; }
      .fc-messages::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 3px; }

      .fc-msg { max-width: 88%; padding: 12px 16px; border-radius: 16px;
        font-size: 13.5px; line-height: 1.55; word-wrap: break-word; }
      .fc-msg a { color: ${COLORS.primary}; text-decoration: underline; }
      .fc-msg a:hover { color: ${COLORS.primaryDark}; }
      .fc-msg-bot {
        align-self: flex-start; background: ${COLORS.white};
        border: 1px solid ${COLORS.border}; border-radius: 4px 16px 16px 16px;
        color: ${COLORS.text};
      }
      .fc-msg-user {
        align-self: flex-end;
        background: linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark});
        color: ${COLORS.white}; border-radius: 16px 4px 16px 16px;
      }
      .fc-msg-bot .fc-md-h { font-size: 14px; font-weight: 700; margin: 0 0 8px; color: ${COLORS.primaryDark}; }
      .fc-msg-bot .fc-ul { margin: 6px 0; padding-left: 18px; }
      .fc-msg-bot .fc-li { margin-bottom: 3px; list-style: disc; }
      .fc-msg-bot strong { color: ${COLORS.primaryDark}; }

      /* Quick replies */
      .fc-quick-replies { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 16px 12px;
        background: ${COLORS.lightBg}; flex-shrink: 0; }
      .fc-quick-btn {
        padding: 6px 14px; border-radius: 20px; font-size: 12px;
        border: 1px solid ${COLORS.primary}; background: ${COLORS.white};
        color: ${COLORS.primary}; cursor: pointer; font-family: inherit;
        transition: all .2s ease; white-space: nowrap;
      }
      .fc-quick-btn:hover {
        background: ${COLORS.primary}; color: ${COLORS.white};
      }

      /* Input */
      .fc-input-area {
        display: flex; align-items: center; padding: 12px 16px;
        border-top: 1px solid ${COLORS.border}; background: ${COLORS.white}; flex-shrink: 0;
      }
      .fc-input {
        flex: 1; border: 1px solid ${COLORS.border}; border-radius: 24px;
        padding: 10px 16px; font-size: 13.5px; outline: none;
        font-family: inherit; color: ${COLORS.text}; background: ${COLORS.lightBg};
        transition: border-color .2s;
      }
      .fc-input::placeholder { color: ${COLORS.textLight}; }
      .fc-input:focus { border-color: ${COLORS.primary}; }
      .fc-send-btn {
        width: 38px; height: 38px; border-radius: 50%; border: none;
        background: linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark});
        color: ${COLORS.white}; cursor: pointer; margin-left: 8px;
        display: flex; align-items: center; justify-content: center;
        transition: transform .2s; flex-shrink: 0;
      }
      .fc-send-btn:hover { transform: scale(1.08); }
      .fc-send-btn svg { width: 18px; height: 18px; fill: ${COLORS.white}; }

      /* Typing indicator */
      .fc-typing { display: flex; gap: 4px; padding: 12px 16px; align-self: flex-start; }
      .fc-dot { width: 8px; height: 8px; border-radius: 50%; background: ${COLORS.border};
        animation: fc-bounce .6s infinite alternate; }
      .fc-dot:nth-child(2) { animation-delay: .15s; }
      .fc-dot:nth-child(3) { animation-delay: .3s; }
      @keyframes fc-bounce { to { background: ${COLORS.primary}; transform: translateY(-4px); } }

      /* Powered by */
      .fc-powered { text-align: center; padding: 6px; font-size: 10px;
        color: ${COLORS.textLight}; background: ${COLORS.white}; flex-shrink: 0; }

      /* Mobile adjustments */
      @media (max-width: 480px) {
        #fc-chat-window { right: 0; bottom: 0; width: 100%; height: 100%;
          max-height: 100vh; border-radius: 0; }
        #fc-chat-launcher { bottom: 16px; right: 16px; }
      }
    `;
    const style = document.createElement("style");
    style.id = "fc-chat-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function buildWidget() {
    // Launcher button
    const launcher = document.createElement("button");
    launcher.id = "fc-chat-launcher";
    launcher.setAttribute("aria-label", "Open Francesca Chat");
    launcher.innerHTML = `
      <svg class="fc-chat-icon" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/><path d="M7 9h10v2H7zm0-3h10v2H7z"/></svg>
      <svg class="fc-close-icon" viewBox="0 0 24 24"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      <span id="fc-chat-badge" class="fc-hidden">1</span>
    `;

    // Chat window
    const win = document.createElement("div");
    win.id = "fc-chat-window";
    win.innerHTML = `
      <div class="fc-header">
        <div class="fc-header-avatar">💄</div>
        <div class="fc-header-info">
          <div class="fc-header-name">Francesca Chat</div>
          <div class="fc-header-status">● Online — Ask me anything!</div>
        </div>
      </div>
      <div class="fc-messages" id="fc-messages"></div>
      <div class="fc-quick-replies" id="fc-quick-replies"></div>
      <div class="fc-input-area">
        <input class="fc-input" id="fc-input" type="text" placeholder="Type your message…" autocomplete="off" />
        <button class="fc-send-btn" id="fc-send" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
      </div>
      <div class="fc-powered">Powered by Francesca Chat ✨</div>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(win);
  }

  /* ─────────────────────── CHAT LOGIC ─────────────────────── */

  let chatOpen = false;
  let welcomed = false;

  function toggleChat() {
    chatOpen = !chatOpen;
    const win = document.getElementById("fc-chat-window");
    const launcher = document.getElementById("fc-chat-launcher");
    const badge = document.getElementById("fc-chat-badge");

    if (chatOpen) {
      win.classList.add("fc-visible");
      launcher.classList.add("fc-open");
      badge.classList.add("fc-hidden");
      document.getElementById("fc-input").focus();
      trackEvent("francesca_chat_open", { session_id: sessionId });
      if (!welcomed) {
        welcomed = true;
        addBotMessage(
          `Hi there! 👋 I'm **Francesca Chat**, your virtual assistant for **Permanent Makeup by Francesca**.\n\nI can help you with services, products, booking, and more. What can I help you with today?`
        );
        showQuickReplies([
          "Our Services",
          "Book Appointment",
          "Products",
          "About Francesca",
          "Contact Us",
          "FAQ",
        ]);
      }
    } else {
      win.classList.remove("fc-visible");
      launcher.classList.remove("fc-open");
    }
  }

  function addUserMessage(text) {
    const container = document.getElementById("fc-messages");
    const msg = document.createElement("div");
    msg.className = "fc-msg fc-msg-user";
    msg.textContent = text;
    container.appendChild(msg);
    scrollToBottom();
  }

  function addBotMessage(text) {
    const container = document.getElementById("fc-messages");
    const msg = document.createElement("div");
    msg.className = "fc-msg fc-msg-bot";
    msg.innerHTML = renderMarkdown(text);
    container.appendChild(msg);
    scrollToBottom();
  }

  function showTyping() {
    const container = document.getElementById("fc-messages");
    const typing = document.createElement("div");
    typing.className = "fc-typing";
    typing.id = "fc-typing";
    typing.innerHTML =
      '<div class="fc-dot"></div><div class="fc-dot"></div><div class="fc-dot"></div>';
    container.appendChild(typing);
    scrollToBottom();
  }

  function hideTyping() {
    const el = document.getElementById("fc-typing");
    if (el) el.remove();
  }

  function showQuickReplies(options) {
    const container = document.getElementById("fc-quick-replies");
    container.innerHTML = "";
    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "fc-quick-btn";
      btn.textContent = opt;
      btn.addEventListener("click", () => handleSend(opt));
      container.appendChild(btn);
    });
  }

  function clearQuickReplies() {
    document.getElementById("fc-quick-replies").innerHTML = "";
  }

  function scrollToBottom() {
    const container = document.getElementById("fc-messages");
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }

  /* ───────────────────── API CALL WITH FALLBACK ───────────────────── */

  /**
   * Call the server-side OpenAI proxy. Returns the AI reply string,
   * or null if the call fails (so we can fall back to local matching).
   */
  async function callAPI(message) {
    if (!API_URL) return null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message,
          history: conversationHistory.slice(-MAX_HISTORY),
          session_id: sessionId,
          page: window.location.href,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) return null;

      const data = await res.json();
      if (data.status === "ok" && data.live) {
        return "__LIVE__";
      }
      if (data.status === "ok" && data.reply) {
        return data.reply;
      }
      return null;
    } catch (_err) {
      // Network error, timeout, CORS issue, etc. → fall back to local
      return null;
    }
  }

  async function handleSend(overrideText) {
    const input = document.getElementById("fc-input");
    const text = (overrideText || input.value).trim();
    if (!text) return;

    addUserMessage(text);
    input.value = "";
    clearQuickReplies();
    showTyping();
    trackEvent("francesca_chat_message", { session_id: sessionId, message_length: text.length });

    // Track user message in history
    conversationHistory.push({ role: "user", content: text });

    // Try AI-powered API first, fall back to local keyword matcher
    let reply = await callAPI(text);
    let isAI = !!reply;

    // If operator is live, don't send a bot reply — operator will respond via polling
    if (reply === "__LIVE__") {
      hideTyping();
      return;
    }

    if (!reply) {
      // Simulate brief thinking time for local responses
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
      reply = getReply(text);
    }

    hideTyping();
    addBotMessage(reply);

    // Track assistant reply in history
    conversationHistory.push({ role: "assistant", content: reply });

    // Context-aware quick replies
    const q = text.toLowerCase();
    if (/service|eyebrow|eyeliner|lip|procell|tattoo/i.test(q)) {
      showQuickReplies(["Book Appointment", "Pricing", "Free Consultation", "Gallery"]);
    } else if (/product|osmosis|shop|grande|lightstim/i.test(q)) {
      showQuickReplies(["Osmosis Skincare", "Grande Cosmetics", "LightStim LED", "Free Shipping?"]);
    } else if (/book|appointment|consult/i.test(q)) {
      showQuickReplies(["Services", "Pricing", "Payment Plans", "Care Instructions"]);
    } else if (/about|francesca|certif/i.test(q)) {
      showQuickReplies(["Services", "Testimonials", "Book Appointment"]);
    } else {
      showQuickReplies(["Services", "Products", "Book Appointment", "Contact Us"]);
    }
  }

  /* ─────────────────────── INITIALIZATION ─────────────────────── */

  function init() {
    injectStyles();
    buildWidget();

    document
      .getElementById("fc-chat-launcher")
      .addEventListener("click", toggleChat);

    document.getElementById("fc-send").addEventListener("click", () => handleSend());

    document.getElementById("fc-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSend();
    });

    // Show badge after a few seconds to attract attention
    setTimeout(() => {
      if (!chatOpen) {
        document.getElementById("fc-chat-badge").classList.remove("fc-hidden");
      }
    }, 3000);

    // Track page view (fire-and-forget)
    trackPageView();

    // Start polling for operator messages
    startOperatorPolling();
  }

  /** Track a page view (once per page load). */
  function trackPageView() {
    try {
      const payload = {
        url: window.location.href,
        referrer: document.referrer || "",
        visitor_id: sessionId || "",
      };
      navigator.sendBeacon
        ? navigator.sendBeacon(TRACK_URL, new Blob([JSON.stringify(payload)], { type: "application/json" }))
        : fetch(TRACK_URL, { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    } catch (_e) { /* silent */ }
  }

  /** Poll for operator (human) messages every 4 seconds. */
  function startOperatorPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      if (!sessionId) return;
      try {
        const url = POLL_URL + "?session_id=" + encodeURIComponent(sessionId)
          + (lastPollTime ? "&after=" + encodeURIComponent(lastPollTime) : "");
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();

        if (data.session_status === "live" && !isOperatorMode) {
          isOperatorMode = true;
        }

        if (data.messages && data.messages.length > 0) {
          data.messages.forEach((m) => {
            addBotMessage("\u{1F469} **Francesca:** " + m.content);
            conversationHistory.push({ role: "assistant", content: m.content });
            if (m.created_at) lastPollTime = m.created_at;
          });
        }
      } catch (_e) { /* ignore polling errors */ }
    }, 4000);
  }

  // Boot when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
