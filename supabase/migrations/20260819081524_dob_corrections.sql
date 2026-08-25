CREATE TABLE IF NOT EXISTS dob_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prn VARCHAR(255) NOT NULL,
    submitted_name VARCHAR(255) NOT NULL,
    submitted_dob DATE NOT NULL,
    department VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    processed_by VARCHAR(255)
);;
