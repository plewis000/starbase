-- EA Seed Data — pre-populate from INBOX_CLASSIFICATION.md and LEARNING_LOOP.md
-- Bootstrap accuracy target: ~55-60% (vs ~40% cold start)

-- ════════════════════════════════════════════════════════════
-- Category Config (9 categories from LEARNING_LOOP.md)
-- ════════════════════════════════════════════════════════════
INSERT INTO ea.category_config (category_name, weight, detail_level, suppress_threshold, urgency_default) VALUES
  ('health',             0.95, 'full_context', 0.10, 1),
  ('financial',          0.85, 'summary',      0.15, 2),
  ('family',             0.90, 'full_context', 0.10, 2),
  ('household',          0.70, 'summary',      0.25, 3),
  ('dev_infrastructure', 0.65, 'one_liner',    0.30, 3),
  ('work_shuttle',       0.80, 'summary',      0.20, 3),
  ('security_auth',      0.50, 'one_liner',    0.30, 2),
  ('promotions',         0.05, 'one_liner',    0.90, 4),
  ('community',          0.15, 'one_liner',    0.80, 4);

-- ════════════════════════════════════════════════════════════
-- Sender Profiles (from INBOX_CLASSIFICATION.md)
-- ════════════════════════════════════════════════════════════

-- === ALWAYS SURFACE ===
INSERT INTO ea.sender_profiles (sender_domain, sender_email, display_name, category, importance_weight, always_surface) VALUES
  ('kp.org',                    'KAISER.PERMANENTE-SCAL@kp.org',           'Kaiser (Doctor)',    'health',    1.00, true),
  ('notifications.kp.org',     'kp-donotreply-dnp@notifications.kp.org',  'Kaiser (Alerts)',    'health',    0.80, true),
  ('accounts.google.com',      'no-reply@accounts.google.com',            'Google Security',    'security_auth', 0.90, true),
  ('venmo.com',                'venmo@venmo.com',                          'Venmo',              'financial', 0.80, true),
  ('taekimcpa.clientportal.com','notifications@taekimcpa.clientportal.com','Tae Kim CPA',        'financial', 0.80, true),
  ('vercel.com',               'notifications@vercel.com',                 'Vercel',             'dev_infrastructure', 0.90, true);

-- === DEFAULT ===
INSERT INTO ea.sender_profiles (sender_domain, sender_email, display_name, category, importance_weight) VALUES
  ('chase.com',               'no.reply.alerts@chase.com',               'Chase',              'financial', 0.70),
  ('etrade.com',              'E-tradeAlerts-DoNotReply@etrade.com',     'E*TRADE',            'financial', 0.60),
  ('americanexpress.com',     'AmericanExpress@welcome.americanexpress.com', 'American Express', 'financial', 0.50),
  ('paypal.com',              'service@paypal.com',                       'PayPal',             'financial', 0.50),
  ('wellsfargo.com',          'alerts@notify.wellsfargo.com',             'Wells Fargo',        'financial', 0.60),
  ('github.com',              'noreply@github.com',                       'GitHub',             'dev_infrastructure', 0.70),
  ('supabase.com',            NULL,                                       'Supabase',           'dev_infrastructure', 0.50),
  ('avalonweb.com',           'wecare@avalonweb.com',                     'HOA (Avalon)',       'household', 0.50),
  ('usps.com',                'auto-reply@usps.com',                      'USPS Tracking',     'household', 0.50),
  ('socalgas.com',            'customerservice@socalgas.com',             'SoCalGas',          'household', 0.50),
  ('mail.anthropic.com',      NULL,                                       'Anthropic',         'dev_infrastructure', 0.50),
  ('email.claude.com',        NULL,                                       'Claude Team',       'dev_infrastructure', 0.40),
  ('secretlair.wizards.com',  'no-reply@secretlair.wizards.com',          'Wizards of the Coast', 'household', 0.50),
  ('servicetitan.com',        'plewis@servicetitan.com',                  'Parker (Work)',     'work_shuttle', 0.60),
  ('linkedin.com',            'messages-noreply@linkedin.com',            'LinkedIn (Messages)', 'community', 0.40),
  ('read-a-thon.com',         'Colby@read-a-thon.com',                   'Read-A-Thon',       'family', 0.40);

-- === AUTO-SUPPRESS ===
INSERT INTO ea.sender_profiles (sender_domain, sender_email, display_name, category, importance_weight, auto_suppress) VALUES
  ('is.email.nextdoor.com',   'no-reply@is.email.nextdoor.com',          'Nextdoor',           'community',    0.30, true),
  ('email.informeddelivery.usps.com', NULL,                               'USPS Informed Delivery', 'household', 0.30, true),
  ('email.openai.com',        'noreply@email.openai.com',                'ChatGPT/OpenAI',     'promotions',   0.10, true),
  ('ouraring.com',            'no-reply@m.ouraring.com',                  'Oura',               'promotions',   0.20, true),
  ('linkedin.com',            'invitations@linkedin.com',                 'LinkedIn Invites',   'promotions',   0.30, true),
  ('linkedin.com',            'linkedin@em.linkedin.com',                 'LinkedIn Premium',   'promotions',   0.10, true),
  ('alerts.spotify.com',      'no-reply@alerts.spotify.com',              'Spotify',            'security_auth', 0.30, true),
  ('link.com',                'notifications@link.com',                   'Link',               'security_auth', 0.30, true),
  ('e-rewards.dominos.com',   'rewards@e-rewards.dominos.com',            'Dominos',            'promotions',   0.10, true),
  ('feedback.hilton.com',     'noreply@feedback.hilton.com',              'Hilton',             'promotions',   0.20, true),
  ('updates.ynab.com',        'billing@updates.ynab.com',                 'YNAB',               'financial',    0.30, true),
  ('info6.citi.com',          'citicards@info6.citi.com',                  'Costco Visa (Citi)', 'financial',    0.40, true),
  ('email.schwab.com',        'donotreply@email.schwab.com',              'Charles Schwab',     'financial',    0.40, true),
  ('proxyvote.com',           'id@proxyvote.com',                          'Fidelity/ProxyVote', 'financial',    0.30, true),
  ('policy.farmers.com',      'noreply@policy.farmers.com',               'Farmers Insurance',  'promotions',   0.30, true),
  ('billmatrix.com',          'DoNotReplyFrontierBillPay@billmatrix.com', 'Frontier',           'household',    0.40, true),
  ('huggingface.co',          'website@huggingface.co',                    'Hugging Face',       'dev_infrastructure', 0.30, true),
  ('google.com',              'payments-noreply@google.com',               'Google Payments',    'promotions',   0.30, true),
  ('kp.org',                  'KPAutoResponse-SCAL@kp.org',               'Kaiser (Payments)',  'health',       0.40, true);

-- === EXPLICIT RULES (from DISCOVERY_INTERVIEW.md) ===
INSERT INTO ea.explicit_rules (rule_type, sender_pattern, category, source) VALUES
  ('always_surface', '*@kp.org',                    'health',    'seed'),
  ('always_surface', '*@notifications.kp.org',      'health',    'seed'),
  ('always_surface', '*@accounts.google.com',        'security_auth', 'seed'),
  ('always_surface', '*@venmo.com',                  'financial', 'seed'),
  ('always_surface', '*@taekimcpa.clientportal.com', 'financial', 'seed'),
  ('auto_suppress',  '*@is.email.nextdoor.com',      'community', 'seed'),
  ('auto_suppress',  '*@email.informeddelivery.usps.com', 'household', 'seed'),
  ('auto_suppress',  '*@email.openai.com',           'promotions', 'seed'),
  ('auto_suppress',  '*@ouraring.com',               'promotions', 'seed'),
  ('auto_suppress',  '*@em.linkedin.com',            'promotions', 'seed'),
  ('auto_suppress',  '*@alerts.spotify.com',          'security_auth', 'seed'),
  ('auto_suppress',  '*@e-rewards.dominos.com',       'promotions', 'seed'),
  ('auto_suppress',  '*@feedback.hilton.com',          'promotions', 'seed'),
  ('share_flag',     '*@avalonweb.com',               'household', 'seed');

-- Set action_value for share_flag rules
UPDATE ea.explicit_rules SET action_value = 'lenale' WHERE rule_type = 'share_flag';
