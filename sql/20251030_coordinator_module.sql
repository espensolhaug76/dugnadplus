-- Dugnad+ Database Schema
-- Supabase PostgreSQL schema for coordinator functionality

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Teams/Clubs table
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  age_group TEXT NOT NULL,
  season TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Families table
CREATE TABLE families (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  family_name TEXT NOT NULL,
  primary_email TEXT NOT NULL,
  primary_phone TEXT NOT NULL,
  base_points INTEGER DEFAULT 0,
  family_points INTEGER DEFAULT 0,
  total_points INTEGER GENERATED ALWAYS AS (base_points + family_points) STORED,
  level INTEGER DEFAULT 0,
  protected_group BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT CHECK (role IN ('parent', 'coordinator', 'coach', 'team_leader')) NOT NULL,
  phone TEXT,
  fcm_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shifts table
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  role TEXT CHECK (role IN ('kiosk', 'ticket_sales', 'setup', 'cleanup', 'baking', 'transport', 'other')) NOT NULL,
  required_people INTEGER DEFAULT 1,
  point_value INTEGER NOT NULL,
  status TEXT CHECK (status IN ('pending', 'assigned', 'confirmed', 'completed', 'cancelled')) DEFAULT 'pending',
  buffer_date TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shift Assignments table
CREATE TABLE shift_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE,
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  assigned_by TEXT CHECK (assigned_by IN ('automatic', 'manual', 'volunteer')) DEFAULT 'automatic',
  status TEXT CHECK (status IN ('assigned', 'confirmed', 'completed', 'no_show', 'swapped', 'cancelled')) DEFAULT 'assigned',
  assigned_date TIMESTAMPTZ DEFAULT NOW(),
  confirmed_date TIMESTAMPTZ,
  completed_date TIMESTAMPTZ,
  notification_sent BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shift_id, family_id)
);

-- Point History table
CREATE TABLE point_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  point_type TEXT CHECK (point_type IN ('base', 'family', 'bonus')) NOT NULL,
  points_earned INTEGER NOT NULL,
  reason TEXT NOT NULL,
  related_shift_id UUID REFERENCES shifts(id),
  related_role TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shift Swaps table
CREATE TABLE shift_swaps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_assignment_id UUID REFERENCES shift_assignments(id) ON DELETE CASCADE,
  requesting_family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  target_family_id UUID REFERENCES families(id) ON DELETE SET NULL,
  status TEXT CHECK (status IN ('pending', 'accepted', 'declined', 'completed', 'cancelled')) DEFAULT 'pending',
  request_message TEXT,
  response_message TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Substitutes table (teenagers/adults offering services)
CREATE TABLE substitutes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  age INTEGER NOT NULL,
  hourly_rate_min INTEGER NOT NULL,
  hourly_rate_max INTEGER NOT NULL,
  available_roles TEXT[] NOT NULL,
  rating DECIMAL(3,2) DEFAULT 0.0,
  total_jobs INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Substitute Requests table
CREATE TABLE substitute_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE,
  requesting_family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  substitute_id UUID REFERENCES substitutes(id) ON DELETE SET NULL,
  status TEXT CHECK (status IN ('open', 'bidding', 'accepted', 'completed', 'cancelled')) DEFAULT 'open',
  offered_rate INTEGER,
  accepted_rate INTEGER,
  request_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('shift_assigned', 'shift_reminder', 'swap_request', 'substitute_available', 'points_earned')) NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  read BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_families_team ON families(team_id);
CREATE INDEX idx_families_points ON families(total_points);
CREATE INDEX idx_users_family ON users(family_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_shifts_team ON shifts(team_id);
CREATE INDEX idx_shifts_date ON shifts(date);
CREATE INDEX idx_shifts_status ON shifts(status);
CREATE INDEX idx_shift_assignments_shift ON shift_assignments(shift_id);
CREATE INDEX idx_shift_assignments_family ON shift_assignments(family_id);
CREATE INDEX idx_shift_assignments_status ON shift_assignments(status);
CREATE INDEX idx_point_history_family ON point_history(family_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_substitute_requests_shift ON substitute_requests(shift_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_families_updated_at BEFORE UPDATE ON families
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shifts_updated_at BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shift_assignments_updated_at BEFORE UPDATE ON shift_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_substitutes_updated_at BEFORE UPDATE ON substitutes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_substitute_requests_updated_at BEFORE UPDATE ON substitute_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically update family points when point history is added
CREATE OR REPLACE FUNCTION update_family_points()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.point_type = 'base' THEN
    UPDATE families 
    SET base_points = base_points + NEW.points_earned
    WHERE id = NEW.family_id;
  ELSIF NEW.point_type = 'family' THEN
    UPDATE families 
    SET family_points = family_points + NEW.points_earned
    WHERE id = NEW.family_id;
  ELSIF NEW.point_type = 'bonus' THEN
    UPDATE families 
    SET base_points = base_points + NEW.points_earned
    WHERE id = NEW.family_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_points_trigger AFTER INSERT ON point_history
  FOR EACH ROW EXECUTE FUNCTION update_family_points();

-- Function to calculate family level based on points
CREATE OR REPLACE FUNCTION calculate_family_level()
RETURNS TRIGGER AS $$
DECLARE
  new_level INTEGER;
BEGIN
  -- Level calculation: 100 points = level 1, 300 = level 2, 500 = level 3, 1000+ = level 4
  IF NEW.total_points >= 1000 THEN
    new_level := 4;
  ELSIF NEW.total_points >= 500 THEN
    new_level := 3;
  ELSIF NEW.total_points >= 300 THEN
    new_level := 2;
  ELSIF NEW.total_points >= 100 THEN
    new_level := 1;
  ELSE
    new_level := 0;
  END IF;
  
  IF new_level != NEW.level THEN
    NEW.level := new_level;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_level_trigger BEFORE UPDATE OF base_points, family_points ON families
  FOR EACH ROW EXECUTE FUNCTION calculate_family_level();

-- Function to create notification when shift is assigned
CREATE OR REPLACE FUNCTION notify_shift_assignment()
RETURNS TRIGGER AS $$
DECLARE
  shift_info RECORD;
  family_users CURSOR FOR SELECT id FROM users WHERE family_id = NEW.family_id;
BEGIN
  -- Get shift details
  SELECT s.date, s.start_time, s.end_time, s.role, t.name as team_name
  INTO shift_info
  FROM shifts s
  JOIN teams t ON s.team_id = t.id
  WHERE s.id = NEW.shift_id;
  
  -- Create notification for all family members
  FOR user_record IN family_users LOOP
    INSERT INTO notifications (
      user_id,
      type,
      title,
      body,
      data
    ) VALUES (
      user_record.id,
      'shift_assigned',
      'Ny dugnad tildelt',
      format('Du har fått tildelt %s den %s kl. %s-%s',
        shift_info.role,
        shift_info.date::DATE,
        shift_info.start_time,
        shift_info.end_time
      ),
      jsonb_build_object(
        'shift_id', NEW.shift_id,
        'assignment_id', NEW.id,
        'date', shift_info.date,
        'role', shift_info.role
      )
    );
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notify_assignment_trigger AFTER INSERT ON shift_assignments
  FOR EACH ROW EXECUTE FUNCTION notify_shift_assignment();

-- Row Level Security (RLS)
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_swaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE substitutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE substitute_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies (basic examples - should be customized based on auth requirements)
CREATE POLICY "Users can view their own family data" ON families
  FOR SELECT USING (
    id IN (SELECT family_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Coordinators can view all families in their team" ON families
  FOR SELECT USING (
    team_id IN (
      SELECT t.id FROM teams t
      JOIN users u ON u.id = auth.uid()
      WHERE u.role = 'coordinator'
    )
  );

-- Additional policies would be added here for other tables and operations

-- Sample data for testing (optional)
-- INSERT INTO teams (name, sport, age_group, season) 
-- VALUES ('Kil Fotball', 'Football', 'G9', '2025');
