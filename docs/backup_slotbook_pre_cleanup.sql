--
-- PostgreSQL database dump
--

\restrict jStSS1FNN4AJDVI7pRKtHXJ7MT2L6mYf2kjfuarLa4bjCw107qitGBh0k0ki52S

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'SQL_ASCII';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: active_reservations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.active_reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_id uuid NOT NULL,
    event_type_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    buffered_range tstzrange NOT NULL
);


ALTER TABLE public.active_reservations OWNER TO postgres;

--
-- Name: availability_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.availability_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_id uuid NOT NULL,
    weekday integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    CONSTRAINT availability_rules_weekday_check CHECK (((weekday >= 1) AND (weekday <= 7))),
    CONSTRAINT chk_rule_times CHECK ((start_time < end_time))
);


ALTER TABLE public.availability_rules OWNER TO postgres;

--
-- Name: bookings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type_id uuid NOT NULL,
    guest_name text,
    guest_email text,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    status text NOT NULL,
    hold_expires_at timestamp with time zone,
    cancellation_reason text,
    manage_token_hash text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    meeting_purpose text DEFAULT 'General Appointment'::text NOT NULL,
    host_local_date date,
    meet_link text,
    google_calendar_event_id text,
    CONSTRAINT bookings_status_check CHECK ((status = ANY (ARRAY['HELD'::text, 'CONFIRMED'::text, 'CANCELLED'::text, 'EXPIRED'::text, 'RESCHEDULED'::text]))),
    CONSTRAINT chk_booking_times CHECK ((start_at < end_at))
);


ALTER TABLE public.bookings OWNER TO postgres;

--
-- Name: date_overrides; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.date_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_id uuid NOT NULL,
    override_date date NOT NULL,
    is_available boolean DEFAULT true NOT NULL,
    custom_start_time time without time zone,
    custom_end_time time without time zone,
    CONSTRAINT chk_override_times CHECK (((custom_start_time IS NULL) OR (custom_end_time IS NULL) OR (custom_start_time < custom_end_time)))
);


ALTER TABLE public.date_overrides OWNER TO postgres;

--
-- Name: event_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    duration_minutes integer NOT NULL,
    capacity integer DEFAULT 1 NOT NULL,
    buffer_before integer DEFAULT 0 NOT NULL,
    buffer_after integer DEFAULT 0 NOT NULL,
    minimum_notice_minutes integer DEFAULT 60 NOT NULL,
    booking_horizon_days integer DEFAULT 30 NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    description text,
    category text DEFAULT 'One-on-One'::text NOT NULL,
    status text DEFAULT 'PUBLISHED'::text NOT NULL,
    CONSTRAINT event_types_booking_horizon_days_check CHECK ((booking_horizon_days >= 1)),
    CONSTRAINT event_types_buffer_after_check CHECK ((buffer_after >= 0)),
    CONSTRAINT event_types_buffer_before_check CHECK ((buffer_before >= 0)),
    CONSTRAINT event_types_capacity_check CHECK ((capacity >= 1)),
    CONSTRAINT event_types_duration_minutes_check CHECK (((duration_minutes >= 15) AND (duration_minutes <= 120))),
    CONSTRAINT event_types_minimum_notice_minutes_check CHECK ((minimum_notice_minutes >= 0))
);


ALTER TABLE public.event_types OWNER TO postgres;

--
-- Name: hosts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hosts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password_hash text,
    home_timezone text DEFAULT 'UTC'::text NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    slug text,
    google_refresh_token text,
    google_access_token text,
    google_token_expiry timestamp with time zone,
    google_email text,
    google_connected_at timestamp with time zone
);


ALTER TABLE public.hosts OWNER TO postgres;

--
-- Name: idempotency_keys; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.idempotency_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    request_hash text NOT NULL,
    response_payload jsonb NOT NULL,
    response_status integer DEFAULT 200 NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


ALTER TABLE public.idempotency_keys OWNER TO postgres;

--
-- Name: notification_outbox; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    delivery_status text DEFAULT 'PENDING'::text NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    recipient_email text,
    subject text,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error text,
    delivered_at timestamp with time zone,
    CONSTRAINT chk_notification_event_types CHECK ((event_type = ANY (ARRAY['BOOKING_CONFIRMED'::text, 'BOOKING_RESCHEDULED'::text, 'BOOKING_CANCELLED'::text, 'HOST_CANCELLED_EVENT'::text, 'EVENT_CREATED'::text, 'EVENT_UPDATED'::text, 'EVENT_DELETED'::text, 'HOST_REGISTERED'::text, 'HOST_ACCOUNT_DELETED'::text]))),
    CONSTRAINT notification_outbox_delivery_status_check CHECK ((delivery_status = ANY (ARRAY['PENDING'::text, 'DELIVERED'::text, 'FAILED'::text])))
);


ALTER TABLE public.notification_outbox OWNER TO postgres;

--
-- Name: otp_codes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.otp_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    purpose text NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


ALTER TABLE public.otp_codes OWNER TO postgres;

--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO postgres;

--
-- Data for Name: active_reservations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.active_reservations (id, host_id, event_type_id, booking_id, buffered_range) FROM stdin;
\.


--
-- Data for Name: availability_rules; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.availability_rules (id, host_id, weekday, start_time, end_time) FROM stdin;
421bb6f9-5167-4f40-9171-bbb74fe0fbab	30c5ced4-d66a-4ac2-87f5-450d610afcf9	1	09:00:00	12:00:00
1ae97ef7-7eb4-4be8-a30e-bc5c93a95247	30c5ced4-d66a-4ac2-87f5-450d610afcf9	1	13:00:00	17:00:00
c0b57e41-5a8e-434e-b006-66c1b17301b6	30c5ced4-d66a-4ac2-87f5-450d610afcf9	2	09:00:00	12:00:00
9deca9d1-30a3-4ccc-b169-51420a6ff587	30c5ced4-d66a-4ac2-87f5-450d610afcf9	2	13:00:00	17:00:00
64fb4798-fa7e-4e50-9ee9-5087f4d1fd7e	30c5ced4-d66a-4ac2-87f5-450d610afcf9	3	09:00:00	12:00:00
1f0c2a3a-9c07-40ef-aeab-1514ff80f734	30c5ced4-d66a-4ac2-87f5-450d610afcf9	3	13:00:00	17:00:00
3454c74b-4fa1-4c56-804b-8805bc4a577e	30c5ced4-d66a-4ac2-87f5-450d610afcf9	4	09:00:00	12:00:00
c419b602-af66-4fe6-8144-150184a710cc	30c5ced4-d66a-4ac2-87f5-450d610afcf9	4	13:00:00	17:00:00
74d46636-5f10-44e8-b612-bbd79b985a17	30c5ced4-d66a-4ac2-87f5-450d610afcf9	5	09:00:00	12:00:00
f8d0da4d-889a-423b-a470-d90275487ed2	30c5ced4-d66a-4ac2-87f5-450d610afcf9	5	13:00:00	17:00:00
\.


--
-- Data for Name: bookings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bookings (id, event_type_id, guest_name, guest_email, start_at, end_at, status, hold_expires_at, cancellation_reason, manage_token_hash, created_at, updated_at, meeting_purpose, host_local_date, meet_link, google_calendar_event_id) FROM stdin;
\.


--
-- Data for Name: date_overrides; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.date_overrides (id, host_id, override_date, is_available, custom_start_time, custom_end_time) FROM stdin;
418239ed-75b1-4db2-9268-4253efdf8025	30c5ced4-d66a-4ac2-87f5-450d610afcf9	2026-11-20	f	\N	\N
\.


--
-- Data for Name: event_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_types (id, host_id, name, slug, duration_minutes, capacity, buffer_before, buffer_after, minimum_notice_minutes, booking_horizon_days, created_at, description, category, status) FROM stdin;
f818a338-05fa-4381-902e-dc36d4f9380d	30c5ced4-d66a-4ac2-87f5-450d610afcf9	30 Min Appointment	30-min-appointment	30	1	10	10	60	30	2026-11-06 14:52:28.811686+05:30	Introductory call or brief consultation	One-on-One	PUBLISHED
94707560-e628-4c91-ae12-34b3fbfe3632	30c5ced4-d66a-4ac2-87f5-450d610afcf9	1 Hr Appointment	1-hr-appointment	60	1	15	15	120	60	2026-11-06 14:52:28.812233+05:30	Introductory call or brief consultation	One-on-One	PUBLISHED
84dee947-298e-49f5-be21-1b18c3f6901b	30c5ced4-d66a-4ac2-87f5-450d610afcf9	Group Discussion	group-discussion	45	4	10	10	180	30	2026-11-06 14:52:28.812549+05:30	Introductory call or brief consultation	One-on-One	PUBLISHED
\.


--
-- Data for Name: hosts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.hosts (id, name, email, password_hash, home_timezone, created_at, status, slug, google_refresh_token, google_access_token, google_token_expiry, google_email, google_connected_at) FROM stdin;
30c5ced4-d66a-4ac2-87f5-450d610afcf9	Alex Chen	alex@slotbook.dev	\N	Asia/Kolkata	2026-11-06 14:52:28.810533+05:30	ACTIVE	alex-chen	\N	\N	\N	\N	\N
\.


--
-- Data for Name: idempotency_keys; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.idempotency_keys (id, key, request_hash, response_payload, response_status, created_at) FROM stdin;
\.


--
-- Data for Name: notification_outbox; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification_outbox (id, booking_id, event_type, payload, delivery_status, created_at, recipient_email, subject, attempt_count, last_error, delivered_at) FROM stdin;
\.


--
-- Data for Name: otp_codes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.otp_codes (id, email, purpose, code_hash, expires_at, consumed_at, attempts, metadata, created_at) FROM stdin;
c87d5369-ea0b-4adc-9788-7533f99f82dc	activehost@example.com	HOST_LOGIN	c1703d00c02bf30e4552a63e989f60d0dd757ca16ae38058abd049ae105634af	2026-11-06 16:59:16.176646+05:30	\N	0	{}	2026-11-06 16:54:16.176647+05:30
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.schema_migrations (filename, applied_at) FROM stdin;
0000_init.sql	2026-11-06 14:51:49.758643+05:30
0001_product_upgrade.sql	2026-11-06 14:51:49.76193+05:30
0002_workflow_and_google_isolation.sql	2026-11-06 16:40:29.907369+05:30
\.


--
-- Name: active_reservations active_reservations_booking_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.active_reservations
    ADD CONSTRAINT active_reservations_booking_id_key UNIQUE (booking_id);


--
-- Name: active_reservations active_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.active_reservations
    ADD CONSTRAINT active_reservations_pkey PRIMARY KEY (id);


--
-- Name: availability_rules availability_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.availability_rules
    ADD CONSTRAINT availability_rules_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_manage_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_manage_token_hash_key UNIQUE (manage_token_hash);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: date_overrides date_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.date_overrides
    ADD CONSTRAINT date_overrides_pkey PRIMARY KEY (id);


--
-- Name: event_types event_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_types
    ADD CONSTRAINT event_types_pkey PRIMARY KEY (id);


--
-- Name: active_reservations exclude_host_schedule_overlap; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.active_reservations
    ADD CONSTRAINT exclude_host_schedule_overlap EXCLUDE USING gist (host_id WITH =, buffered_range WITH &&);


--
-- Name: hosts hosts_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hosts
    ADD CONSTRAINT hosts_email_key UNIQUE (email);


--
-- Name: hosts hosts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hosts
    ADD CONSTRAINT hosts_pkey PRIMARY KEY (id);


--
-- Name: idempotency_keys idempotency_keys_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_key_key UNIQUE (key);


--
-- Name: idempotency_keys idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (id);


--
-- Name: notification_outbox notification_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_outbox
    ADD CONSTRAINT notification_outbox_pkey PRIMARY KEY (id);


--
-- Name: otp_codes otp_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.otp_codes
    ADD CONSTRAINT otp_codes_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: event_types uq_host_slug; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_types
    ADD CONSTRAINT uq_host_slug UNIQUE (host_id, slug);


--
-- Name: idx_active_reservations_host; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_active_reservations_host ON public.active_reservations USING btree (host_id);


--
-- Name: idx_availability_rules_host_weekday; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_availability_rules_host_weekday ON public.availability_rules USING btree (host_id, weekday);


--
-- Name: idx_bookings_event_start; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_event_start ON public.bookings USING btree (event_type_id, start_at);


--
-- Name: idx_bookings_manage_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_manage_token ON public.bookings USING btree (manage_token_hash);


--
-- Name: idx_bookings_status_hold; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_status_hold ON public.bookings USING btree (status, hold_expires_at);


--
-- Name: idx_date_overrides_host_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_date_overrides_host_date ON public.date_overrides USING btree (host_id, override_date);


--
-- Name: idx_event_types_host_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_types_host_id ON public.event_types USING btree (host_id);


--
-- Name: idx_event_types_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_types_slug ON public.event_types USING btree (slug);


--
-- Name: idx_idempotency_keys_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_idempotency_keys_key ON public.idempotency_keys USING btree (key);


--
-- Name: idx_notification_outbox_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notification_outbox_status ON public.notification_outbox USING btree (delivery_status, created_at);


--
-- Name: idx_otp_codes_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_otp_codes_lookup ON public.otp_codes USING btree (email, purpose, expires_at);


--
-- Name: uq_active_booking_per_guest_event_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_active_booking_per_guest_event_date ON public.bookings USING btree (event_type_id, lower(TRIM(BOTH FROM guest_email)), host_local_date) WHERE (status = ANY (ARRAY['HELD'::text, 'CONFIRMED'::text]));


--
-- Name: uq_hosts_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_hosts_slug ON public.hosts USING btree (slug);


--
-- Name: active_reservations active_reservations_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.active_reservations
    ADD CONSTRAINT active_reservations_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: active_reservations active_reservations_event_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.active_reservations
    ADD CONSTRAINT active_reservations_event_type_id_fkey FOREIGN KEY (event_type_id) REFERENCES public.event_types(id) ON DELETE CASCADE;


--
-- Name: active_reservations active_reservations_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.active_reservations
    ADD CONSTRAINT active_reservations_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.hosts(id) ON DELETE CASCADE;


--
-- Name: availability_rules availability_rules_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.availability_rules
    ADD CONSTRAINT availability_rules_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.hosts(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_event_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_event_type_id_fkey FOREIGN KEY (event_type_id) REFERENCES public.event_types(id) ON DELETE CASCADE;


--
-- Name: date_overrides date_overrides_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.date_overrides
    ADD CONSTRAINT date_overrides_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.hosts(id) ON DELETE CASCADE;


--
-- Name: event_types event_types_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_types
    ADD CONSTRAINT event_types_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.hosts(id) ON DELETE CASCADE;


--
-- Name: notification_outbox notification_outbox_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_outbox
    ADD CONSTRAINT notification_outbox_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict jStSS1FNN4AJDVI7pRKtHXJ7MT2L6mYf2kjfuarLa4bjCw107qitGBh0k0ki52S

