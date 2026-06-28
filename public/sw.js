/* Argos service worker (ROADMAP 2.4 item 3 — web push / PWA).
 *
 * Intentionally minimal: it handles incoming push events and notification
 * clicks. No offline/precaching is attempted (that would risk serving stale
 * app shells on the free tier). The push payload is the JSON sent by
 * lib/push/send.ts: { title, body, url }.
 */

self.addEventListener("push", function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Argos", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Argos";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [80, 40, 80],
    tag: data.tag || "argos",
    data: { url: data.url || "/dashboard" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      // Focus an existing tab on the same origin if one is open.
      for (const client of clientList) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin && "focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        } catch (e) {
          /* ignore */
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
