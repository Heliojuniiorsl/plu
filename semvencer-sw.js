self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existingClient = clientList.find((client) => client.url.startsWith(self.registration.scope));

      if (existingClient) {
        return existingClient.focus();
      }

      return self.clients.openWindow(self.registration.scope);
    }),
  );
});
