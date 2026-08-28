const topbarActions = document.querySelector<HTMLElement>(".topbar__actions");

if (topbarActions) {
  const sponsorLink = document.createElement("a");
  sponsorLink.href = "https://github.com/sponsors/medkit992";
  sponsorLink.target = "_blank";
  sponsorLink.rel = "noopener noreferrer";
  sponsorLink.title = "Sponsor medkit992 on GitHub";
  sponsorLink.setAttribute("aria-label", "Sponsor medkit992 on GitHub");

  sponsorLink.style.display = "inline-flex";
  sponsorLink.style.alignItems = "center";
  sponsorLink.style.justifyContent = "center";
  sponsorLink.style.gap = "6px";
  sponsorLink.style.height = "32px";
  sponsorLink.style.padding = "0 11px";
  sponsorLink.style.flexShrink = "0";
  sponsorLink.style.border = "1px solid var(--border)";
  sponsorLink.style.borderRadius = "6px";
  sponsorLink.style.background = "var(--surface-hover)";
  sponsorLink.style.color = "var(--text)";
  sponsorLink.style.fontSize = "11px";
  sponsorLink.style.fontWeight = "600";
  sponsorLink.style.textDecoration = "none";
  sponsorLink.style.cursor = "pointer";
  sponsorLink.style.transition =
    "background 120ms ease, border-color 120ms ease, color 120ms ease";

  const heart = document.createElement("span");
  heart.textContent = "♥";
  heart.setAttribute("aria-hidden", "true");
  heart.style.color = "#db61a2";
  heart.style.fontSize = "14px";
  heart.style.lineHeight = "1";

  const label = document.createElement("span");
  label.textContent = "Sponsor";

  sponsorLink.append(heart, label);

  sponsorLink.addEventListener("mouseenter", () => {
    sponsorLink.style.background = "var(--surface-active)";
    sponsorLink.style.borderColor = "var(--border-light)";
  });

  sponsorLink.addEventListener("mouseleave", () => {
    sponsorLink.style.background = "var(--surface-hover)";
    sponsorLink.style.borderColor = "var(--border)";
  });

  const narrowViewport = window.matchMedia("(max-width: 720px)");

  function updateSponsorVisibility(): void {
    sponsorLink.hidden = narrowViewport.matches;
    sponsorLink.style.display = narrowViewport.matches ? "none" : "inline-flex";
  }

  updateSponsorVisibility();
  narrowViewport.addEventListener("change", updateSponsorVisibility);

  topbarActions.prepend(sponsorLink);
}
