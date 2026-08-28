CREATE TABLE cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  badge TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);

CREATE INDEX clicks_card_id_created_at ON clicks (card_id, created_at);

INSERT INTO cards (name, description, url, badge, color, sort_order) VALUES
  ('LaunchList', 'A dead-simple waitlist page you can spin up in 60 seconds.', '', 'LA', '#0e7a5f', 1),
  ('Snipnote', 'Turn any webpage highlight into a searchable note.', '', 'SN', '#b4552d', 2),
  ('ColdBrewed', 'A curated map of the best coffee shops for remote work.', '', 'CO', '#3d5a80', 3),
  ('Formlet', 'Tiny embeddable forms that don’t look like forms.', '', 'FO', '#7a5f0e', 4),
  ('Streakly', 'Habit tracking that only asks one question a day.', '', 'ST', '#5f3d80', 5),
  ('PageSpy', 'Get an alert when any webpage changes.', '', 'PA', '#80513d', 6),
  ('Draftpile', 'A home for all your half-finished writing.', '', 'DR', '#0e7a5f', 7),
  ('QuickQR', 'Branded QR codes with scan analytics, no account needed.', '', 'QU', '#b4552d', 8),
  ('Muted', 'A minimalist white-noise mixer for deep work.', '', 'MU', '#3d5a80', 9),
  ('Shelfie', 'Track and share the books actually on your shelf.', '', 'SH', '#7a5f0e', 10),
  ('Pingback', 'Uptime monitoring that texts you before your users do.', '', 'PI', '#5f3d80', 11),
  ('Sundial', 'A calendar that plans around your energy, not your hours.', '', 'SU', '#80513d', 12);
