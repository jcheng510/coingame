// Animate hero stat counters when the hero scrolls into view.
const counters = document.querySelectorAll(".hero-meta strong");

const animate = (el) => {
  const target = el.textContent.trim();
  const match = target.match(/^([^\d]*)([\d,.]+)([^\d]*)$/);
  if (!match) return;
  const prefix = match[1];
  const suffix = match[3];
  const numeric = parseFloat(match[2].replace(/,/g, ""));
  if (isNaN(numeric)) return;

  const duration = 1100;
  const start = performance.now();
  const format = (n) => {
    if (numeric >= 1000) return Math.round(n).toLocaleString();
    return n.toFixed(numeric % 1 === 0 ? 0 : 1);
  };

  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = `${prefix}${format(numeric * eased)}${suffix}`;
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = target;
  };
  requestAnimationFrame(step);
};

const obs = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        animate(e.target);
        obs.unobserve(e.target);
      }
    });
  },
  { threshold: 0.4 }
);
counters.forEach((c) => obs.observe(c));

// Close other FAQ items when one opens, for a cleaner read.
const faq = document.querySelectorAll(".faq-list details");
faq.forEach((d) => {
  d.addEventListener("toggle", () => {
    if (d.open) faq.forEach((o) => o !== d && (o.open = false));
  });
});
