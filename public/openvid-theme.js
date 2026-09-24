(function () {
  try {
    var get = function (name) {
      var match = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
      return match ? decodeURIComponent(match[1]) : null;
    };
    var preference = get("openvid_theme_pref") || get("openvid_theme") || "system";
    var isDark = preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : preference === "dark";
    document.documentElement.classList.toggle("dark", isDark);
  } catch {
    // Theme setup must never prevent the page from loading.
  }
})();
