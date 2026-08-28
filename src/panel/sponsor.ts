const topbarActions = document.querySelector<HTMLElement>(".topbar__actions");

if (topbarActions) {
  const sponsorFrame = document.createElement("iframe");
  sponsorFrame.src = "https://github.com/sponsors/medkit992/button";
  sponsorFrame.title = "Sponsor medkit992";
  sponsorFrame.width = "114";
  sponsorFrame.height = "32";
  sponsorFrame.loading = "lazy";
  sponsorFrame.style.border = "0";
  sponsorFrame.style.borderRadius = "6px";
  sponsorFrame.style.flexShrink = "0";

  const narrowViewport = window.matchMedia("(max-width: 720px)");

  function updateSponsorVisibility(): void {
    sponsorFrame.hidden = narrowViewport.matches;
  }

  updateSponsorVisibility();
  narrowViewport.addEventListener("change", updateSponsorVisibility);

  topbarActions.prepend(sponsorFrame);
}
