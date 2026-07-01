/* The Off-Leash Oracle — Firebase Cloud Messaging service worker.
   Receives daily push notifications when the site tab is closed/in the
   background. Must live at the site root so its scope covers every page.
   Uses the compat SDK because service workers can't use ES module imports. */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAVU4PeZJI8xqo7YOm8QiKvryEVXuv9gLk',
  authDomain: 'binditails-da2de.firebaseapp.com',
  projectId: 'binditails-da2de',
  storageBucket: 'binditails-da2de.firebasestorage.app',
  messagingSenderId: '376117416695',
  appId: '1:376117416695:web:f11c59342cc6a750d739f2'
});

const messaging = firebase.messaging();

// Show the daily reading as a notification while the tab is in the background.
messaging.onBackgroundMessage(function (payload) {
  const n = (payload && payload.notification) || {};
  self.registration.showNotification(n.title || '🔮 The Off-Leash Oracle', {
    body: n.body || 'Your daily trail wisdom has arrived.',
    icon: 'https://offleashoracle.com/oracle-card.png',
    badge: 'https://offleashoracle.com/oracle-card.png',
    tag: 'oracle-daily',
    data: { url: 'https://offleashoracle.com/' }
  });
});

// Focus (or open) the site when the notification is tapped.
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || 'https://offleashoracle.com/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (const c of list) { if (c.url === url && 'focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
