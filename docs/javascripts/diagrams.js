/*
 * Signal-flow diagrams.
 *
 * The fences are emitted as <pre class="mermaid-diagram"><code>…</code></pre> and
 * rendered here against a pinned Mermaid, rather than through the theme's own
 * handling, which leaves the containers empty with the current Mermaid release.
 * The diagrams follow the page's light or dark palette and re-render when the
 * reader switches it.
 */
(function () {
  "use strict";
  var MERMAID = "https://unpkg.com/mermaid@11.17.2/dist/mermaid.min.js";
  var seq = 0;

  function dark() {
    var s = document.body.getAttribute("data-md-color-scheme");
    return s === "slate";
  }

  function configure() {
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: dark() ? "dark" : "default",
      themeVariables: {
        fontFamily: "IBM Plex Sans, system-ui, sans-serif",
        fontSize: "14px",
        primaryColor: dark() ? "#2b2350" : "#efe9fd",
        primaryBorderColor: dark() ? "#8b5cf6" : "#7c3aed",
        primaryTextColor: dark() ? "#ebe9e4" : "#1d1c1a",
        lineColor: dark() ? "#9a8fb8" : "#6d28d9",
        secondaryColor: dark() ? "#1d1f25" : "#f5f3ff",
        tertiaryColor: dark() ? "#15161a" : "#faf9ff"
      },
      flowchart: { htmlLabels: true, curve: "basis" }
    });
  }

  function render() {
    configure();
    var blocks = [].slice.call(document.querySelectorAll("pre.mermaid-diagram, div.mermaid-diagram[data-src]"));
    blocks.forEach(function (el) {
      var src = el.getAttribute("data-src");
      if (src === null) {
        var code = el.querySelector("code") || el;
        src = code.textContent;
      }
      var box = document.createElement("div");
      box.className = "mermaid mermaid-diagram";
      box.setAttribute("data-src", src);
      seq += 1;
      window.mermaid
        .render("diagram-" + seq, src)
        .then(function (out) {
          box.innerHTML = out.svg;
          el.parentNode.replaceChild(box, el);
        })
        .catch(function (err) {
          // Never leave a blank space where a diagram should be.
          var pre = document.createElement("pre");
          pre.className = "mermaid-diagram-failed";
          pre.textContent = src;
          el.parentNode.replaceChild(pre, el);
          if (window.console) window.console.warn("diagram did not render:", err);
        });
    });
  }

  function start() {
    if (window.mermaid) return render();
    var s = document.createElement("script");
    s.src = MERMAID;
    s.onload = render;
    document.head.appendChild(s);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  // The palette toggle rewrites data-md-color-scheme on <body>.
  var scheme = document.body.getAttribute("data-md-color-scheme");
  new MutationObserver(function () {
    var now = document.body.getAttribute("data-md-color-scheme");
    if (now === scheme) return;
    scheme = now;
    if (window.mermaid) render();
  }).observe(document.body, { attributes: true, attributeFilter: ["data-md-color-scheme"] });
})();
