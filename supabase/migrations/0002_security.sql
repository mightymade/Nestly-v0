-- Enable Row Level Security on all core tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostels ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit ENABLE ROW LEVEL SECURITY;

-- Example RLS Policies
CREATE POLICY "Public read active hostels" ON hostels FOR SELECT USING (status = 'live' OR auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin') OR owner_id = auth.uid());

CREATE POLICY "Students manage own bookings" ON bookings FOR ALL USING (student_id = auth.uid());

CREATE POLICY "Custodians manage assigned hostel visitors" ON visitors FOR ALL USING (hostel_id IN (SELECT hostel_id FROM profiles WHERE id = auth.uid() AND role = 'custodian'));

CREATE POLICY "Admins read audit log" ON audit FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));
CREATE POLICY "Users insert own audit entries" ON audit FOR INSERT WITH CHECK (actor_id = auth.uid());