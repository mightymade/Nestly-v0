/* Runs before the app loads. It picks the splash screen's colours: the signed-in person's own light or dark choice
   (saved per account, see src/lib/theme.ts). Signed-out pages are always light, so with no session it stays light. */
(function () {
  try {
    var id = null;
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && /^sb-.*-auth-token$/.test(k)) { var s = JSON.parse(localStorage.getItem(k) || 'null'); id = s && s.user && s.user.id; break; }
    }
    if (!id) { var d = localStorage.getItem('nestly.session'); id = d ? JSON.parse(d) : null; }
    var pref = id ? JSON.parse(localStorage.getItem('nestly.theme.' + id) || '"light"') : 'light';
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-splash', dark ? 'dark' : 'light');
  } catch (e) { document.documentElement.setAttribute('data-splash', 'light'); }
})();
