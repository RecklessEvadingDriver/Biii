export function getOrCreateUserId(): string {
  let id = localStorage.getItem('watchparty_userid');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('watchparty_userid', id);
  }
  return id;
}

export function getDisplayName(): string {
  return localStorage.getItem('watchparty_displayname') || 'Anonymous';
}

export function getUserId(): string | null {
  return localStorage.getItem('watchparty_userid');
}
