/* OptiBoussole — tracking de conversion "guides → app" via Vercel Web Analytics.
   Événement "CTA app" déclenché au clic sur un lien menant à l'application
   (accueil "/", ou écrans "/?ecran=..."). Aucune donnée personnelle : on
   n'envoie que la page source, la cible et le libellé du bouton. */
(function () {
  // File d'attente Vercel Analytics (sûre même si script.js n'est pas encore chargé)
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };

  function isAppLink(href) {
    if (!href) return false;
    return href === "/" || href.indexOf("/?ecran=") === 0;
  }

  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (!isAppLink(href)) return;
    try {
      window.va("event", {
        name: "CTA app",
        data: {
          from: location.pathname,
          target: href,
          label: (a.textContent || "").trim().slice(0, 60)
        }
      });
    } catch (err) { /* no-op */ }
  }, true);
})();
