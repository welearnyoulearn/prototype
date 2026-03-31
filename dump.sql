--
-- PostgreSQL database dump
--

-- Dumped from database version 16.6
-- Dumped by pg_dump version 16.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance (
    id integer NOT NULL,
    school_id integer,
    class_id integer,
    student_id integer,
    date date NOT NULL,
    status character varying(20) DEFAULT 'present'::character varying,
    marked_by_teacher_id integer,
    period_number integer,
    created_at timestamp with time zone DEFAULT now(),
    session character varying(20) DEFAULT 'morning'::character varying,
    marked_at timestamp with time zone DEFAULT now()
);


--
-- Name: attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attendance_id_seq OWNED BY public.attendance.id;


--
-- Name: class_subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_subjects (
    id integer NOT NULL,
    class_id integer,
    subject_name character varying(100) NOT NULL,
    teacher_id integer,
    created_at timestamp without time zone DEFAULT now(),
    periods_per_week integer DEFAULT 4
);


--
-- Name: class_subjects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.class_subjects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: class_subjects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.class_subjects_id_seq OWNED BY public.class_subjects.id;


--
-- Name: class_timetable; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_timetable (
    id integer NOT NULL,
    class_id integer,
    school_id integer,
    day_of_week character varying(10) NOT NULL,
    period_number integer NOT NULL,
    time_from character varying(10),
    time_to character varying(10),
    subject_name character varying(100),
    teacher_id integer,
    room character varying(50),
    is_break boolean DEFAULT false,
    break_label character varying(50),
    created_at timestamp without time zone DEFAULT now(),
    is_manual boolean DEFAULT false
);


--
-- Name: class_timetable_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.class_timetable_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: class_timetable_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.class_timetable_id_seq OWNED BY public.class_timetable.id;


--
-- Name: classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classes (
    id integer NOT NULL,
    school_id integer,
    grade character varying(20) NOT NULL,
    section character varying(10) NOT NULL,
    class_teacher_id integer,
    created_at timestamp without time zone DEFAULT now(),
    timetable_generated_at timestamp with time zone,
    timetable_generated_by character varying(50)
);


--
-- Name: classes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.classes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: classes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.classes_id_seq OWNED BY public.classes.id;


--
-- Name: curriculum_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.curriculum_assignments (
    id integer NOT NULL,
    school_id integer,
    grade character varying(20) NOT NULL,
    curriculum_type character varying(20) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: curriculum_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.curriculum_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: curriculum_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.curriculum_assignments_id_seq OWNED BY public.curriculum_assignments.id;


--
-- Name: daily_newspapers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_newspapers (
    id integer NOT NULL,
    school_id integer,
    date date NOT NULL,
    title character varying(255) NOT NULL,
    subtitle character varying(255),
    content text NOT NULL,
    fun_fact text,
    quiz_question text,
    quiz_answer text,
    topic character varying(100),
    category character varying(50),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: daily_newspapers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.daily_newspapers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: daily_newspapers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.daily_newspapers_id_seq OWNED BY public.daily_newspapers.id;


--
-- Name: doubt_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doubt_messages (
    id integer NOT NULL,
    doubt_id integer NOT NULL,
    school_id integer NOT NULL,
    sender_type character varying(10) NOT NULL,
    sender_id integer NOT NULL,
    sender_name character varying(100) NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    is_final_answer boolean DEFAULT false,
    CONSTRAINT doubt_messages_sender_type_check CHECK (((sender_type)::text = ANY ((ARRAY['student'::character varying, 'teacher'::character varying])::text[])))
);


--
-- Name: doubt_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.doubt_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: doubt_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.doubt_messages_id_seq OWNED BY public.doubt_messages.id;


--
-- Name: doubt_upvotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doubt_upvotes (
    id integer NOT NULL,
    doubt_id integer NOT NULL,
    student_id integer NOT NULL,
    school_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: doubt_upvotes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.doubt_upvotes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: doubt_upvotes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.doubt_upvotes_id_seq OWNED BY public.doubt_upvotes.id;


--
-- Name: doubts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doubts (
    id integer NOT NULL,
    school_id integer NOT NULL,
    class_id integer NOT NULL,
    student_id integer NOT NULL,
    subject character varying(100) NOT NULL,
    question text NOT NULL,
    task_id integer,
    ai_answer text,
    teacher_answer text,
    answered_by integer,
    answered_at timestamp with time zone,
    status character varying(20) DEFAULT 'open'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    last_message_at timestamp with time zone,
    resolved_at timestamp with time zone,
    resolved_by integer,
    message_count integer DEFAULT 0,
    closed_by_teacher boolean DEFAULT false,
    is_class_faq boolean DEFAULT false,
    faq_set_by integer,
    upvote_count integer DEFAULT 0
);


--
-- Name: doubts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.doubts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: doubts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.doubts_id_seq OWNED BY public.doubts.id;


--
-- Name: exam_marks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_marks (
    id integer NOT NULL,
    exam_id integer NOT NULL,
    school_id integer NOT NULL,
    student_id integer NOT NULL,
    subject_name character varying(100) NOT NULL,
    marks_obtained numeric(5,2),
    is_absent boolean DEFAULT false NOT NULL,
    entered_by integer,
    entered_at timestamp with time zone DEFAULT now()
);


--
-- Name: exam_marks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exam_marks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exam_marks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exam_marks_id_seq OWNED BY public.exam_marks.id;


--
-- Name: exam_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_records (
    id integer NOT NULL,
    school_id integer NOT NULL,
    class_id integer NOT NULL,
    created_by integer NOT NULL,
    exam_name character varying(200) NOT NULL,
    exam_type character varying(50) DEFAULT 'unit_test'::character varying NOT NULL,
    exam_date date,
    passing_pct integer DEFAULT 35 NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: exam_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exam_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exam_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exam_records_id_seq OWNED BY public.exam_records.id;


--
-- Name: exam_subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_subjects (
    id integer NOT NULL,
    exam_id integer NOT NULL,
    school_id integer NOT NULL,
    subject_name character varying(100) NOT NULL,
    teacher_id integer,
    teacher_name character varying(100),
    max_marks integer DEFAULT 100 NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    submitted_at timestamp with time zone,
    submitted_by integer
);


--
-- Name: exam_subjects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exam_subjects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exam_subjects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exam_subjects_id_seq OWNED BY public.exam_subjects.id;


--
-- Name: leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_requests (
    id integer NOT NULL,
    teacher_id integer,
    school_id integer,
    leave_type character varying(50) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason text,
    status character varying(20) DEFAULT 'pending'::character varying,
    reviewed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: leave_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leave_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leave_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leave_requests_id_seq OWNED BY public.leave_requests.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    school_id integer,
    recipient_teacher_id integer,
    sender_teacher_id integer,
    type character varying(50) NOT NULL,
    title character varying(200),
    message text,
    data jsonb,
    is_read boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    recipient_school_id integer,
    recipient_student_id integer
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: parent_mark_acks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parent_mark_acks (
    id integer NOT NULL,
    exam_id integer NOT NULL,
    student_id integer NOT NULL,
    school_id integer NOT NULL,
    parent_name character varying(100),
    parent_phone character varying(20),
    acknowledged_at timestamp with time zone DEFAULT now()
);


--
-- Name: parent_mark_acks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.parent_mark_acks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: parent_mark_acks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.parent_mark_acks_id_seq OWNED BY public.parent_mark_acks.id;


--
-- Name: parents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parents (
    id integer NOT NULL,
    school_id integer,
    name character varying(255),
    email character varying(255),
    phone character varying(50),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: parents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.parents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: parents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.parents_id_seq OWNED BY public.parents.id;


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id integer NOT NULL,
    user_id integer,
    token character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.password_reset_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.password_reset_tokens_id_seq OWNED BY public.password_reset_tokens.id;


--
-- Name: school_schedule_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_schedule_settings (
    id integer NOT NULL,
    school_id integer,
    periods_per_day integer DEFAULT 8 NOT NULL,
    start_time character varying(5) DEFAULT '08:30'::character varying NOT NULL,
    end_time character varying(5) DEFAULT '17:00'::character varying NOT NULL,
    morning_break_after_period integer DEFAULT 3 NOT NULL,
    morning_break_duration integer DEFAULT 15 NOT NULL,
    lunch_after_period integer DEFAULT 5 NOT NULL,
    lunch_duration integer DEFAULT 45 NOT NULL,
    afternoon_break_after_period integer DEFAULT 7 NOT NULL,
    afternoon_break_duration integer DEFAULT 10 NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: school_schedule_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.school_schedule_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: school_schedule_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.school_schedule_settings_id_seq OWNED BY public.school_schedule_settings.id;


--
-- Name: school_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_subscriptions (
    id integer NOT NULL,
    school_id integer,
    tier character varying(20) DEFAULT 'none'::character varying,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: school_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.school_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: school_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.school_subscriptions_id_seq OWNED BY public.school_subscriptions.id;


--
-- Name: schools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schools (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(100),
    city character varying(100),
    country character varying(100),
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    phone character varying(50),
    email character varying(255),
    address text,
    school_code character varying(100),
    plan_start_date date,
    plan_end_date date,
    plan_amount numeric(10,2)
);


--
-- Name: schools_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schools_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schools_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schools_id_seq OWNED BY public.schools.id;


--
-- Name: student_badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_badges (
    id integer NOT NULL,
    student_id integer NOT NULL,
    school_id integer NOT NULL,
    badge_type character varying(50) NOT NULL,
    earned_at timestamp with time zone DEFAULT now()
);


--
-- Name: student_badges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.student_badges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: student_badges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.student_badges_id_seq OWNED BY public.student_badges.id;


--
-- Name: student_newspaper_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_newspaper_reads (
    id integer NOT NULL,
    student_id integer NOT NULL,
    newspaper_id integer NOT NULL,
    school_id integer NOT NULL,
    completed_at timestamp with time zone DEFAULT now(),
    points_awarded integer DEFAULT 0
);


--
-- Name: student_newspaper_reads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.student_newspaper_reads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: student_newspaper_reads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.student_newspaper_reads_id_seq OWNED BY public.student_newspaper_reads.id;


--
-- Name: student_parents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_parents (
    id integer NOT NULL,
    student_id integer,
    parent_id integer
);


--
-- Name: student_parents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.student_parents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: student_parents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.student_parents_id_seq OWNED BY public.student_parents.id;


--
-- Name: student_points; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_points (
    id integer NOT NULL,
    student_id integer NOT NULL,
    school_id integer NOT NULL,
    action_type character varying(50) NOT NULL,
    points integer DEFAULT 0 NOT NULL,
    reference_id integer,
    reference_type character varying(50),
    earned_at timestamp with time zone DEFAULT now()
);


--
-- Name: student_points_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.student_points_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: student_points_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.student_points_id_seq OWNED BY public.student_points.id;


--
-- Name: student_streaks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_streaks (
    student_id integer NOT NULL,
    school_id integer NOT NULL,
    current_streak integer DEFAULT 0,
    longest_streak integer DEFAULT 0,
    last_activity_date date
);


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    id integer NOT NULL,
    school_id integer,
    name character varying(255) NOT NULL,
    email character varying(255),
    grade character varying(20),
    section character varying(10),
    phone character varying(50),
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    roll_number character varying(50),
    parent_name character varying(255),
    parent_phone character varying(50),
    parent_email character varying(255),
    password_hash character varying(255),
    password_changed boolean DEFAULT false
);


--
-- Name: students_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.students_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: students_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.students_id_seq OWNED BY public.students.id;


--
-- Name: substitute_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.substitute_assignments (
    id integer NOT NULL,
    school_id integer,
    leave_request_id integer,
    original_teacher_id integer,
    substitute_teacher_id integer,
    class_id integer,
    date date NOT NULL,
    day_of_week character varying(10) NOT NULL,
    period_number integer NOT NULL,
    subject_name character varying(100),
    time_from character varying(10),
    time_to character varying(10),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: substitute_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.substitute_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: substitute_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.substitute_assignments_id_seq OWNED BY public.substitute_assignments.id;


--
-- Name: syllabus_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.syllabus_topics (
    id integer NOT NULL,
    school_id integer NOT NULL,
    class_id integer NOT NULL,
    subject character varying(100) NOT NULL,
    chapter_name character varying(200) NOT NULL,
    chapter_order integer DEFAULT 0,
    topic_name character varying(200) NOT NULL,
    topic_order integer DEFAULT 0,
    status character varying(20) DEFAULT 'pending'::character varying,
    covered_date date,
    covered_by integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: syllabus_topics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.syllabus_topics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: syllabus_topics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.syllabus_topics_id_seq OWNED BY public.syllabus_topics.id;


--
-- Name: task_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_reminders (
    id integer NOT NULL,
    task_id integer NOT NULL,
    school_id integer NOT NULL,
    sent_by integer NOT NULL,
    sent_at timestamp with time zone DEFAULT now(),
    target_type character varying(20) DEFAULT 'all'::character varying,
    student_count integer DEFAULT 0,
    student_ids jsonb DEFAULT '[]'::jsonb
);


--
-- Name: task_reminders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.task_reminders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: task_reminders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.task_reminders_id_seq OWNED BY public.task_reminders.id;


--
-- Name: task_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_submissions (
    id integer NOT NULL,
    task_id integer NOT NULL,
    student_id integer NOT NULL,
    school_id integer NOT NULL,
    submitted_at timestamp with time zone,
    submission_text text,
    file_url character varying(1000),
    file_name character varying(255),
    file_public_id character varying(255),
    file_size_kb integer,
    score numeric(5,2),
    feedback text,
    status character varying(20) DEFAULT 'pending'::character varying,
    resubmission_requested boolean DEFAULT false,
    reviewed_at timestamp with time zone,
    reviewed_by integer
);


--
-- Name: task_submissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.task_submissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: task_submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.task_submissions_id_seq OWNED BY public.task_submissions.id;


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id integer NOT NULL,
    school_id integer NOT NULL,
    class_id integer NOT NULL,
    teacher_id integer NOT NULL,
    title character varying(255) NOT NULL,
    subject character varying(100) NOT NULL,
    task_type character varying(20) DEFAULT 'homework'::character varying NOT NULL,
    max_marks integer DEFAULT 10 NOT NULL,
    instructions text,
    assigned_to character varying(20) DEFAULT 'all'::character varying,
    status character varying(20) DEFAULT 'draft'::character varying,
    due_date date,
    due_time time without time zone DEFAULT '23:59:00'::time without time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tasks_id_seq OWNED BY public.tasks.id;


--
-- Name: teacher_unavailability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_unavailability (
    id integer NOT NULL,
    teacher_id integer,
    school_id integer,
    day_of_week character varying(10) NOT NULL,
    period_number integer NOT NULL,
    reason text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: teacher_unavailability_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.teacher_unavailability_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: teacher_unavailability_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.teacher_unavailability_id_seq OWNED BY public.teacher_unavailability.id;


--
-- Name: teachers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teachers (
    id integer NOT NULL,
    school_id integer,
    name character varying(255) NOT NULL,
    email character varying(255),
    subject character varying(100),
    phone character varying(50),
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    employee_id character varying(50),
    department character varying(100),
    qualification character varying(200),
    date_of_joining date,
    staff_type character varying(20) DEFAULT 'teaching'::character varying,
    teaches_grades text,
    password_hash character varying(255),
    password_changed boolean DEFAULT false
);


--
-- Name: teachers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.teachers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: teachers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.teachers_id_seq OWNED BY public.teachers.id;


--
-- Name: timetable; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timetable (
    id integer NOT NULL,
    teacher_id integer,
    school_id integer,
    day_of_week character varying(10) NOT NULL,
    period_number integer,
    time_from character varying(10),
    time_to character varying(10),
    subject character varying(100),
    grade character varying(20),
    section character varying(10),
    room character varying(50),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: timetable_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.timetable_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: timetable_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.timetable_id_seq OWNED BY public.timetable.id;


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    id integer NOT NULL,
    user_id integer,
    full_name character varying(255),
    phone character varying(50),
    designation character varying(100),
    bio text,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: user_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_profiles_id_seq OWNED BY public.user_profiles.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(255),
    school_code character varying(100),
    password_hash character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'school_admin'::character varying NOT NULL,
    school_id integer,
    first_login boolean DEFAULT true,
    profile_completed boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: weekly_tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_tests (
    id integer NOT NULL,
    school_id integer NOT NULL,
    class_id integer NOT NULL,
    student_id integer NOT NULL,
    week_start date NOT NULL,
    questions jsonb DEFAULT '[]'::jsonb NOT NULL,
    student_answers jsonb,
    score integer,
    max_score integer,
    status character varying(20) DEFAULT 'available'::character varying,
    generated_at timestamp with time zone DEFAULT now(),
    submitted_at timestamp with time zone
);


--
-- Name: weekly_tests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.weekly_tests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: weekly_tests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.weekly_tests_id_seq OWNED BY public.weekly_tests.id;


--
-- Name: attendance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance ALTER COLUMN id SET DEFAULT nextval('public.attendance_id_seq'::regclass);


--
-- Name: class_subjects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_subjects ALTER COLUMN id SET DEFAULT nextval('public.class_subjects_id_seq'::regclass);


--
-- Name: class_timetable id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_timetable ALTER COLUMN id SET DEFAULT nextval('public.class_timetable_id_seq'::regclass);


--
-- Name: classes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes ALTER COLUMN id SET DEFAULT nextval('public.classes_id_seq'::regclass);


--
-- Name: curriculum_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_assignments ALTER COLUMN id SET DEFAULT nextval('public.curriculum_assignments_id_seq'::regclass);


--
-- Name: daily_newspapers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_newspapers ALTER COLUMN id SET DEFAULT nextval('public.daily_newspapers_id_seq'::regclass);


--
-- Name: doubt_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doubt_messages ALTER COLUMN id SET DEFAULT nextval('public.doubt_messages_id_seq'::regclass);


--
-- Name: doubt_upvotes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doubt_upvotes ALTER COLUMN id SET DEFAULT nextval('public.doubt_upvotes_id_seq'::regclass);


--
-- Name: doubts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doubts ALTER COLUMN id SET DEFAULT nextval('public.doubts_id_seq'::regclass);


--
-- Name: exam_marks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_marks ALTER COLUMN id SET DEFAULT nextval('public.exam_marks_id_seq'::regclass);


--
-- Name: exam_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_records ALTER COLUMN id SET DEFAULT nextval('public.exam_records_id_seq'::regclass);


--
-- Name: exam_subjects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_subjects ALTER COLUMN id SET DEFAULT nextval('public.exam_subjects_id_seq'::regclass);


--
-- Name: leave_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests ALTER COLUMN id SET DEFAULT nextval('public.leave_requests_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: parent_mark_acks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_mark_acks ALTER COLUMN id SET DEFAULT nextval('public.parent_mark_acks_id_seq'::regclass);


--
-- Name: parents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parents ALTER COLUMN id SET DEFAULT nextval('public.parents_id_seq'::regclass);


--
-- Name: password_reset_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens ALTER COLUMN id SET DEFAULT nextval('public.password_reset_tokens_id_seq'::regclass);


--
-- Name: school_schedule_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_schedule_settings ALTER COLUMN id SET DEFAULT nextval('public.school_schedule_settings_id_seq'::regclass);


--
-- Name: school_subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.school_subscriptions_id_seq'::regclass);


--
-- Name: schools id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools ALTER COLUMN id SET DEFAULT nextval('public.schools_id_seq'::regclass);


--
-- Name: student_badges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_badges ALTER COLUMN id SET DEFAULT nextval('public.student_badges_id_seq'::regclass);


--
-- Name: student_newspaper_reads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_newspaper_reads ALTER COLUMN id SET DEFAULT nextval('public.student_newspaper_reads_id_seq'::regclass);


--
-- Name: student_parents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_parents ALTER COLUMN id SET DEFAULT nextval('public.student_parents_id_seq'::regclass);


--
-- Name: student_points id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_points ALTER COLUMN id SET DEFAULT nextval('public.student_points_id_seq'::regclass);


--
-- Name: students id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students ALTER COLUMN id SET DEFAULT nextval('public.students_id_seq'::regclass);


--
-- Name: substitute_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.substitute_assignments ALTER COLUMN id SET DEFAULT nextval('public.substitute_assignments_id_seq'::regclass);


--
-- Name: syllabus_topics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus_topics ALTER COLUMN id SET DEFAULT nextval('public.syllabus_topics_id_seq'::regclass);


--
-- Name: task_reminders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_reminders ALTER COLUMN id SET DEFAULT nextval('public.task_reminders_id_seq'::regclass);


--
-- Name: task_submissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_submissions ALTER COLUMN id SET DEFAULT nextval('public.task_submissions_id_seq'::regclass);


--
-- Name: tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks ALTER COLUMN id SET DEFAULT nextval('public.tasks_id_seq'::regclass);


--
-- Name: teacher_unavailability id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_unavailability ALTER COLUMN id SET DEFAULT nextval('public.teacher_unavailability_id_seq'::regclass);


--
-- Name: teachers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers ALTER COLUMN id SET DEFAULT nextval('public.teachers_id_seq'::regclass);


--
-- Name: timetable id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable ALTER COLUMN id SET DEFAULT nextval('public.timetable_id_seq'::regclass);


--
-- Name: user_profiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles ALTER COLUMN id SET DEFAULT nextval('public.user_profiles_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: weekly_tests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_tests ALTER COLUMN id SET DEFAULT nextval('public.weekly_tests_id_seq'::regclass);


--
-- Data for Name: attendance; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.attendance (id, school_id, class_id, student_id, date, status, marked_by_teacher_id, period_number, created_at, session, marked_at) FROM stdin;
7	5	55	12	2026-03-20	absent	108	\N	2026-03-22 11:01:04.016561+05:30	morning	2026-03-22 11:37:09.92366+05:30
8	5	55	18	2026-03-20	present	108	\N	2026-03-22 11:01:04.032023+05:30	morning	2026-03-22 11:37:09.92366+05:30
9	5	55	15	2026-03-20	present	108	\N	2026-03-22 11:01:04.033154+05:30	morning	2026-03-22 11:37:09.92366+05:30
1	5	55	12	2026-03-22	present	85	\N	2026-03-22 10:36:13.910151+05:30	morning	2026-03-22 11:37:09.92366+05:30
2	5	55	18	2026-03-22	present	85	\N	2026-03-22 10:36:13.936839+05:30	morning	2026-03-22 11:37:09.92366+05:30
3	5	55	15	2026-03-22	present	85	\N	2026-03-22 10:36:13.938361+05:30	morning	2026-03-22 11:37:09.92366+05:30
13	5	45	34	2026-03-22	absent	108	\N	2026-03-22 12:02:00.644272+05:30	morning	2026-03-22 12:02:00.644272+05:30
14	5	45	40	2026-03-22	present	108	\N	2026-03-22 12:02:00.66754+05:30	morning	2026-03-22 12:02:00.66754+05:30
15	5	45	37	2026-03-22	late	108	\N	2026-03-22 12:02:00.669344+05:30	morning	2026-03-22 12:02:00.669344+05:30
16	5	45	31	2026-03-22	present	108	\N	2026-03-22 12:02:00.671082+05:30	morning	2026-03-22 12:02:00.671082+05:30
\.


--
-- Data for Name: class_subjects; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.class_subjects (id, class_id, subject_name, teacher_id, created_at, periods_per_week) FROM stdin;
421	43	Telugu	108	2026-03-20 23:28:34.785775	4
422	43	English	79	2026-03-20 23:28:34.785775	4
423	43	Hindi	98	2026-03-20 23:28:34.785775	4
424	43	Mathematics	91	2026-03-20 23:28:34.785775	4
425	43	Physical Science	\N	2026-03-20 23:28:34.785775	4
426	43	Biological Science	\N	2026-03-20 23:28:34.785775	4
427	43	Social Studies	94	2026-03-20 23:28:34.785775	4
428	48	Telugu	108	2026-03-20 23:28:34.785775	4
429	48	English	79	2026-03-20 23:28:34.785775	4
430	48	Hindi	98	2026-03-20 23:28:34.785775	4
431	48	Mathematics	91	2026-03-20 23:28:34.785775	4
432	48	Physical Science	\N	2026-03-20 23:28:34.785775	4
433	48	Biological Science	\N	2026-03-20 23:28:34.785775	4
434	48	Social Studies	94	2026-03-20 23:28:34.785775	4
435	55	Telugu	108	2026-03-20 23:28:34.785775	4
436	55	English	79	2026-03-20 23:28:34.785775	4
437	55	Hindi	98	2026-03-20 23:28:34.785775	4
438	55	Mathematics	91	2026-03-20 23:28:34.785775	4
439	55	Physical Science	\N	2026-03-20 23:28:34.785775	4
440	55	Biological Science	\N	2026-03-20 23:28:34.785775	4
441	55	Social Studies	94	2026-03-20 23:28:34.785775	4
442	46	Telugu	108	2026-03-20 23:29:53.776005	4
443	46	English	79	2026-03-20 23:29:53.776005	4
444	46	Hindi	98	2026-03-20 23:29:53.776005	4
445	46	Mathematics	91	2026-03-20 23:29:53.776005	4
446	46	Physical Science	\N	2026-03-20 23:29:53.776005	4
447	46	Biological Science	\N	2026-03-20 23:29:53.776005	4
448	46	Social Studies	94	2026-03-20 23:29:53.776005	4
649	43	dance	86	2026-03-29 01:38:21.61071	4
650	97	English	\N	2026-03-29 21:30:06.662083	4
651	97	Environmental Studies	\N	2026-03-29 21:30:08.649324	4
652	97	Telugu	174	2026-03-29 21:30:09.736818	4
653	97	Mathematics	\N	2026-03-29 21:33:14.327154	4
654	96	English	\N	2026-03-31 19:37:23.698519	4
655	96	Mathematics	\N	2026-03-31 19:37:25.102004	4
656	96	Telugu	174	2026-03-31 19:37:28.824551	4
657	96	Hindi	\N	2026-03-31 19:37:48.145092	4
658	96	Physical Education	\N	2026-03-31 19:37:49.423306	4
659	96	Environmental Science	100	2026-03-31 19:37:50.326342	4
660	96	Environmental Studies	\N	2026-03-31 19:38:26.094544	4
449	49	Telugu	108	2026-03-20 23:29:53.776005	4
450	49	English	79	2026-03-20 23:29:53.776005	4
451	49	Hindi	98	2026-03-20 23:29:53.776005	4
452	49	Mathematics	91	2026-03-20 23:29:53.776005	4
453	49	Physical Science	\N	2026-03-20 23:29:53.776005	4
454	49	Biological Science	\N	2026-03-20 23:29:53.776005	4
455	49	Social Studies	94	2026-03-20 23:29:53.776005	4
456	61	Telugu	108	2026-03-20 23:29:53.776005	4
457	61	English	79	2026-03-20 23:29:53.776005	4
458	61	Hindi	98	2026-03-20 23:29:53.776005	4
459	61	Mathematics	91	2026-03-20 23:29:53.776005	4
460	61	Physical Science	\N	2026-03-20 23:29:53.776005	4
461	61	Biological Science	\N	2026-03-20 23:29:53.776005	4
462	61	Social Studies	94	2026-03-20 23:29:53.776005	4
463	47	Telugu	108	2026-03-20 23:29:58.677763	4
464	47	English	79	2026-03-20 23:29:58.677763	4
465	47	Hindi	98	2026-03-20 23:29:58.677763	4
466	47	Mathematics	91	2026-03-20 23:29:58.677763	4
467	47	Physical Science	\N	2026-03-20 23:29:58.677763	4
468	47	Biological Science	\N	2026-03-20 23:29:58.677763	4
469	47	Social Studies	94	2026-03-20 23:29:58.677763	4
470	59	Telugu	108	2026-03-20 23:29:58.677763	4
471	59	English	79	2026-03-20 23:29:58.677763	4
472	59	Hindi	98	2026-03-20 23:29:58.677763	4
473	59	Mathematics	91	2026-03-20 23:29:58.677763	4
474	59	Physical Science	\N	2026-03-20 23:29:58.677763	4
475	59	Biological Science	\N	2026-03-20 23:29:58.677763	4
476	59	Social Studies	94	2026-03-20 23:29:58.677763	4
477	45	Telugu	108	2026-03-20 23:30:02.84774	4
478	45	English	79	2026-03-20 23:30:02.84774	4
479	45	Hindi	98	2026-03-20 23:30:02.84774	4
480	45	Mathematics	91	2026-03-20 23:30:02.84774	4
481	45	Physical Science	\N	2026-03-20 23:30:02.84774	4
482	45	Biological Science	\N	2026-03-20 23:30:02.84774	4
483	45	Social Studies	94	2026-03-20 23:30:02.84774	4
484	45	Computer Science	100	2026-03-20 23:30:02.84774	4
485	51	Telugu	108	2026-03-20 23:30:02.84774	4
486	51	English	79	2026-03-20 23:30:02.84774	4
487	51	Hindi	98	2026-03-20 23:30:02.84774	4
488	51	Mathematics	91	2026-03-20 23:30:02.84774	4
489	51	Physical Science	\N	2026-03-20 23:30:02.84774	4
490	51	Biological Science	\N	2026-03-20 23:30:02.84774	4
491	51	Social Studies	94	2026-03-20 23:30:02.84774	4
492	51	Computer Science	100	2026-03-20 23:30:02.84774	4
381	50	Telugu	108	2026-03-20 23:04:16.874057	4
382	50	English	79	2026-03-20 23:04:16.874057	4
383	50	Hindi	98	2026-03-20 23:04:16.874057	4
384	50	Mathematics	91	2026-03-20 23:04:16.874057	4
385	50	Physical Science	\N	2026-03-20 23:04:16.874057	4
386	50	Biological Science	\N	2026-03-20 23:04:16.874057	4
387	50	Social Studies	94	2026-03-20 23:04:16.874057	4
388	50	Computer Science	100	2026-03-20 23:04:16.874057	4
389	56	Telugu	108	2026-03-20 23:04:16.874057	4
390	56	English	79	2026-03-20 23:04:16.874057	4
391	56	Hindi	98	2026-03-20 23:04:16.874057	4
392	56	Mathematics	91	2026-03-20 23:04:16.874057	4
393	56	Physical Science	\N	2026-03-20 23:04:16.874057	4
394	56	Biological Science	\N	2026-03-20 23:04:16.874057	4
395	56	Social Studies	94	2026-03-20 23:04:16.874057	4
396	56	Computer Science	100	2026-03-20 23:04:16.874057	4
397	44	Telugu	108	2026-03-20 23:04:16.874057	4
398	44	English	79	2026-03-20 23:04:16.874057	4
399	44	Hindi	98	2026-03-20 23:04:16.874057	4
400	44	Mathematics	91	2026-03-20 23:04:16.874057	4
401	44	Physical Science	\N	2026-03-20 23:04:16.874057	4
402	44	Biological Science	\N	2026-03-20 23:04:16.874057	4
403	44	Social Studies	94	2026-03-20 23:04:16.874057	4
404	44	Computer Science	100	2026-03-20 23:04:16.874057	4
\.


--
-- Data for Name: class_timetable; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.class_timetable (id, class_id, school_id, day_of_week, period_number, time_from, time_to, subject_name, teacher_id, room, is_break, break_label, created_at, is_manual) FROM stdin;
18826	45	5	Monday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
18827	45	5	Monday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
18828	45	5	Monday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
18829	45	5	Tuesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
18830	45	5	Tuesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
18831	45	5	Tuesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
18832	45	5	Wednesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
18833	45	5	Wednesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
18834	45	5	Wednesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
18835	45	5	Thursday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
18836	45	5	Thursday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
18837	45	5	Thursday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
18838	45	5	Friday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
18839	45	5	Friday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
18840	45	5	Friday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
18841	45	5	Saturday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
18842	45	5	Saturday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
18843	45	5	Saturday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
18844	45	5	Monday	1	08:30	09:25	Telugu	108	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18845	45	5	Monday	2	09:25	10:20	English	79	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18846	45	5	Monday	3	10:20	11:15	Hindi	98	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18847	45	5	Monday	5	11:30	12:25	Mathematics	91	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18848	45	5	Monday	6	12:25	13:20	Social Studies	94	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18849	45	5	Monday	8	14:05	15:00	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
18850	45	5	Monday	9	15:00	15:55	Telugu	108	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18851	45	5	Monday	11	16:05	17:00	English	79	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18852	45	5	Tuesday	1	08:30	09:25	Hindi	98	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18853	45	5	Tuesday	2	09:25	10:20	Mathematics	91	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18854	45	5	Tuesday	3	10:20	11:15	Social Studies	94	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18855	45	5	Tuesday	5	11:30	12:25	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
18856	45	5	Tuesday	6	12:25	13:20	Telugu	108	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18857	45	5	Tuesday	8	14:05	15:00	English	79	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18858	45	5	Tuesday	9	15:00	15:55	Hindi	98	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18859	45	5	Tuesday	11	16:05	17:00	Mathematics	91	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18860	45	5	Wednesday	1	08:30	09:25	Social Studies	94	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18861	45	5	Wednesday	2	09:25	10:20	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
18862	45	5	Wednesday	3	10:20	11:15	Telugu	108	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18863	45	5	Wednesday	5	11:30	12:25	English	79	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18864	45	5	Wednesday	6	12:25	13:20	Hindi	98	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18865	45	5	Wednesday	8	14:05	15:00	Mathematics	91	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18866	45	5	Wednesday	9	15:00	15:55	Social Studies	94	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18867	45	5	Wednesday	11	16:05	17:00	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
18868	45	5	Thursday	1	08:30	09:25	Telugu	108	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18869	45	5	Thursday	2	09:25	10:20	English	79	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18870	45	5	Thursday	3	10:20	11:15	Hindi	98	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18871	45	5	Thursday	5	11:30	12:25	Mathematics	91	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18872	45	5	Thursday	6	12:25	13:20	Social Studies	94	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18873	45	5	Thursday	8	14:05	15:00	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
18874	45	5	Thursday	9	15:00	15:55	Telugu	108	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18875	45	5	Thursday	11	16:05	17:00	English	79	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18876	45	5	Friday	1	08:30	09:25	Hindi	98	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18877	45	5	Friday	2	09:25	10:20	Mathematics	91	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18878	45	5	Friday	3	10:20	11:15	Social Studies	94	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18879	45	5	Friday	5	11:30	12:25	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
18880	45	5	Friday	6	12:25	13:20	Physical Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18881	45	5	Friday	8	14:05	15:00	Biological Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18882	45	5	Friday	9	15:00	15:55	Physical Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18883	45	5	Friday	11	16:05	17:00	Biological Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18884	45	5	Saturday	1	08:30	09:25	Physical Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18885	45	5	Saturday	2	09:25	10:20	Biological Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18886	45	5	Saturday	3	10:20	11:15	Physical Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18887	45	5	Saturday	5	11:30	12:25	Biological Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18888	45	5	Saturday	6	12:25	13:20	Physical Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18889	45	5	Saturday	8	14:05	15:00	Biological Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18890	45	5	Saturday	9	15:00	15:55	Physical Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18891	45	5	Saturday	11	16:05	17:00	Biological Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18892	51	5	Monday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
18893	51	5	Monday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
18894	51	5	Monday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
18895	51	5	Tuesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
18896	51	5	Tuesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
18897	51	5	Tuesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
18898	51	5	Wednesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
18899	51	5	Wednesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
18900	51	5	Wednesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
18901	51	5	Thursday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
18902	51	5	Thursday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
18903	51	5	Thursday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
18904	51	5	Friday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
18905	51	5	Friday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
18906	51	5	Friday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
18907	51	5	Saturday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
18908	51	5	Saturday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
18909	51	5	Saturday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
18910	51	5	Monday	1	08:30	09:25	Telugu	174	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18911	51	5	Monday	2	09:25	10:20	English	97	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18912	51	5	Monday	3	10:20	11:15	Hindi	99	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18913	51	5	Monday	5	11:30	12:25	Social Studies	94	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18914	51	5	Monday	6	12:25	13:20	Mathematics	91	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18915	51	5	Monday	8	14:05	15:00	Computer Science	101	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
18916	51	5	Monday	9	15:00	15:55	Telugu	174	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18917	51	5	Monday	11	16:05	17:00	English	97	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18918	51	5	Tuesday	1	08:30	09:25	Hindi	99	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18919	51	5	Tuesday	2	09:25	10:20	Social Studies	94	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18920	51	5	Tuesday	3	10:20	11:15	Mathematics	91	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18921	51	5	Tuesday	5	11:30	12:25	Computer Science	101	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
18922	51	5	Tuesday	6	12:25	13:20	Telugu	174	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18923	51	5	Tuesday	8	14:05	15:00	English	97	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18924	51	5	Tuesday	9	15:00	15:55	Hindi	99	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18925	51	5	Tuesday	11	16:05	17:00	Social Studies	94	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18926	51	5	Wednesday	1	08:30	09:25	Mathematics	91	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18927	51	5	Wednesday	2	09:25	10:20	Computer Science	101	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
18928	51	5	Wednesday	3	10:20	11:15	Telugu	174	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18929	51	5	Wednesday	5	11:30	12:25	English	97	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18930	51	5	Wednesday	6	12:25	13:20	Hindi	99	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18931	51	5	Wednesday	8	14:05	15:00	Social Studies	94	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18932	51	5	Wednesday	9	15:00	15:55	Mathematics	91	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18933	51	5	Wednesday	11	16:05	17:00	Computer Science	101	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
18934	51	5	Thursday	1	08:30	09:25	Telugu	174	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18935	51	5	Thursday	2	09:25	10:20	English	97	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18936	51	5	Thursday	3	10:20	11:15	Hindi	99	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18937	51	5	Thursday	5	11:30	12:25	Social Studies	94	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18938	51	5	Thursday	6	12:25	13:20	Mathematics	91	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18939	51	5	Thursday	8	14:05	15:00	Computer Science	101	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
18940	51	5	Thursday	9	15:00	15:55	Telugu	174	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18941	51	5	Thursday	11	16:05	17:00	English	97	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18942	51	5	Friday	1	08:30	09:25	Hindi	99	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18943	51	5	Friday	2	09:25	10:20	Social Studies	94	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18944	51	5	Friday	3	10:20	11:15	Mathematics	91	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18945	51	5	Friday	5	11:30	12:25	Computer Science	101	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
18946	51	5	Friday	6	12:25	13:20	Physical Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18947	51	5	Friday	8	14:05	15:00	Biological Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18948	51	5	Friday	9	15:00	15:55	Physical Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18949	51	5	Friday	11	16:05	17:00	Biological Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18950	51	5	Saturday	1	08:30	09:25	Physical Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18951	51	5	Saturday	2	09:25	10:20	Biological Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18952	51	5	Saturday	3	10:20	11:15	Physical Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18953	51	5	Saturday	5	11:30	12:25	Biological Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18954	51	5	Saturday	6	12:25	13:20	Physical Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18955	51	5	Saturday	8	14:05	15:00	Biological Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18956	51	5	Saturday	9	15:00	15:55	Physical Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18957	51	5	Saturday	11	16:05	17:00	Biological Science	\N	Room 110	f	\N	2026-03-29 21:13:34.113325	f
18958	59	5	Monday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
18959	59	5	Monday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
18960	59	5	Monday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
18961	59	5	Tuesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
18962	59	5	Tuesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
18963	59	5	Tuesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
18964	59	5	Wednesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
18965	59	5	Wednesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
18966	59	5	Wednesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
18967	59	5	Thursday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
18968	59	5	Thursday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
18969	59	5	Thursday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
18970	59	5	Friday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
18971	59	5	Friday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
18972	59	5	Friday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
18973	59	5	Saturday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
18974	59	5	Saturday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
18975	59	5	Saturday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
18976	59	5	Monday	1	08:30	09:25	English	79	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18977	59	5	Monday	2	09:25	10:20	Telugu	108	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18978	59	5	Monday	3	10:20	11:15	Mathematics	91	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18979	59	5	Monday	5	11:30	12:25	Hindi	98	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18980	59	5	Monday	6	12:25	13:20	Telugu	108	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18981	59	5	Monday	8	14:05	15:00	English	79	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18982	59	5	Monday	9	15:00	15:55	Hindi	98	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18983	59	5	Monday	11	16:05	17:00	Mathematics	91	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18984	59	5	Tuesday	1	08:30	09:25	Social Studies	94	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18985	59	5	Tuesday	2	09:25	10:20	Telugu	108	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18986	59	5	Tuesday	3	10:20	11:15	English	79	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18987	59	5	Tuesday	5	11:30	12:25	Hindi	98	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18988	59	5	Tuesday	6	12:25	13:20	Mathematics	91	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18989	59	5	Tuesday	8	14:05	15:00	Social Studies	94	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18990	59	5	Tuesday	9	15:00	15:55	Telugu	108	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18991	59	5	Tuesday	11	16:05	17:00	English	79	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18992	59	5	Wednesday	1	08:30	09:25	Hindi	98	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18993	59	5	Wednesday	2	09:25	10:20	Mathematics	91	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18994	59	5	Wednesday	3	10:20	11:15	Social Studies	94	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18995	59	5	Wednesday	5	11:30	12:25	Telugu	108	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18996	59	5	Wednesday	6	12:25	13:20	English	79	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18997	59	5	Wednesday	8	14:05	15:00	Hindi	98	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18998	59	5	Wednesday	9	15:00	15:55	Telugu	108	Room 106	f	\N	2026-03-29 21:13:34.113325	f
18999	59	5	Wednesday	11	16:05	17:00	Mathematics	91	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19000	59	5	Thursday	1	08:30	09:25	Social Studies	94	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19001	59	5	Thursday	2	09:25	10:20	English	96	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19002	59	5	Thursday	3	10:20	11:15	Mathematics	91	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19003	59	5	Thursday	5	11:30	12:25	Hindi	98	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19004	59	5	Thursday	6	12:25	13:20	Telugu	108	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19005	59	5	Thursday	8	14:05	15:00	Social Studies	94	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19006	59	5	Thursday	9	15:00	15:55	English	79	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19007	59	5	Thursday	11	16:05	17:00	Hindi	98	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19008	59	5	Friday	1	08:30	09:25	Mathematics	91	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19009	59	5	Friday	2	09:25	10:20	Physical Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19010	59	5	Friday	3	10:20	11:15	Biological Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19011	59	5	Friday	5	11:30	12:25	Social Studies	94	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19012	59	5	Friday	6	12:25	13:20	Physical Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19013	59	5	Friday	8	14:05	15:00	Biological Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19014	59	5	Friday	9	15:00	15:55	Physical Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19015	59	5	Friday	11	16:05	17:00	Biological Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19016	59	5	Saturday	1	08:30	09:25	Physical Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19017	59	5	Saturday	2	09:25	10:20	Biological Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19018	59	5	Saturday	3	10:20	11:15	Physical Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19019	59	5	Saturday	5	11:30	12:25	Biological Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19020	59	5	Saturday	6	12:25	13:20	Physical Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19021	59	5	Saturday	8	14:05	15:00	Biological Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19022	59	5	Saturday	9	15:00	15:55	Physical Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19023	59	5	Saturday	11	16:05	17:00	Biological Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19024	47	5	Monday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19025	47	5	Monday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19026	47	5	Monday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19027	47	5	Tuesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19028	47	5	Tuesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19029	47	5	Tuesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19030	47	5	Wednesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19031	47	5	Wednesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19032	47	5	Wednesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19033	47	5	Thursday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19034	47	5	Thursday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19035	47	5	Thursday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19036	47	5	Friday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19037	47	5	Friday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19038	47	5	Friday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19039	47	5	Saturday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19040	47	5	Saturday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19041	47	5	Saturday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19042	47	5	Monday	1	08:30	09:25	English	96	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19043	47	5	Monday	2	09:25	10:20	Telugu	174	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19044	47	5	Monday	3	10:20	11:15	English	79	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19045	47	5	Monday	5	11:30	12:25	Telugu	108	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19046	47	5	Monday	6	12:25	13:20	Hindi	98	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19047	47	5	Monday	8	14:05	15:00	Mathematics	91	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19048	47	5	Monday	9	15:00	15:55	Social Studies	94	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19049	47	5	Monday	11	16:05	17:00	Hindi	98	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19050	47	5	Tuesday	1	08:30	09:25	Mathematics	91	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19051	47	5	Tuesday	2	09:25	10:20	Telugu	174	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19052	47	5	Tuesday	3	10:20	11:15	English	96	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19053	47	5	Tuesday	5	11:30	12:25	Mathematics	91	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19054	47	5	Tuesday	6	12:25	13:20	Hindi	98	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19055	47	5	Tuesday	8	14:05	15:00	Telugu	108	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19056	47	5	Tuesday	9	15:00	15:55	Social Studies	94	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19057	47	5	Tuesday	11	16:05	17:00	English	96	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19058	47	5	Wednesday	1	08:30	09:25	Telugu	108	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19059	47	5	Wednesday	2	09:25	10:20	Hindi	98	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19060	47	5	Wednesday	3	10:20	11:15	Mathematics	91	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19061	47	5	Wednesday	5	11:30	12:25	Social Studies	94	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19062	47	5	Wednesday	6	12:25	13:20	English	96	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19063	47	5	Wednesday	8	14:05	15:00	Telugu	108	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19064	47	5	Wednesday	9	15:00	15:55	Hindi	98	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19065	47	5	Wednesday	11	16:05	17:00	Social Studies	94	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19066	47	5	Thursday	1	08:30	09:25	Mathematics	91	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19067	47	5	Thursday	2	09:25	10:20	Hindi	98	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19068	47	5	Thursday	3	10:20	11:15	English	79	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19069	47	5	Thursday	5	11:30	12:25	Telugu	108	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19070	47	5	Thursday	6	12:25	13:20	English	79	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19071	47	5	Thursday	8	14:05	15:00	Mathematics	91	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19072	47	5	Thursday	9	15:00	15:55	Social Studies	94	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19073	47	5	Thursday	11	16:05	17:00	Social Studies	94	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19074	47	5	Friday	1	08:30	09:25	Physical Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19075	47	5	Friday	2	09:25	10:20	Hindi	98	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19076	47	5	Friday	3	10:20	11:15	Biological Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19077	47	5	Friday	5	11:30	12:25	Mathematics	91	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19078	47	5	Friday	6	12:25	13:20	Physical Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19079	47	5	Friday	8	14:05	15:00	Biological Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19080	47	5	Friday	9	15:00	15:55	Physical Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19081	47	5	Friday	11	16:05	17:00	Biological Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19082	47	5	Saturday	1	08:30	09:25	Physical Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19083	47	5	Saturday	2	09:25	10:20	Biological Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19084	47	5	Saturday	3	10:20	11:15	Physical Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19085	47	5	Saturday	5	11:30	12:25	Biological Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19086	47	5	Saturday	6	12:25	13:20	Physical Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19087	47	5	Saturday	8	14:05	15:00	Biological Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19088	47	5	Saturday	9	15:00	15:55	Physical Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19089	47	5	Saturday	11	16:05	17:00	Biological Science	\N	Room 106	f	\N	2026-03-29 21:13:34.113325	f
19090	49	5	Monday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19091	49	5	Monday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19092	49	5	Monday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19093	49	5	Tuesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19094	49	5	Tuesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19095	49	5	Tuesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19096	49	5	Wednesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19097	49	5	Wednesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19098	49	5	Wednesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19099	49	5	Thursday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19100	49	5	Thursday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19101	49	5	Thursday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19102	49	5	Friday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19103	49	5	Friday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19104	49	5	Friday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19105	49	5	Saturday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19106	49	5	Saturday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19107	49	5	Saturday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19108	49	5	Monday	1	08:30	09:25	Hindi	98	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19109	49	5	Monday	2	09:25	10:20	English	96	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19110	49	5	Monday	3	10:20	11:15	Telugu	108	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19111	49	5	Monday	5	11:30	12:25	English	79	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19112	49	5	Monday	6	12:25	13:20	Telugu	174	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19113	49	5	Monday	8	14:05	15:00	Hindi	98	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19114	49	5	Monday	9	15:00	15:55	Mathematics	91	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19115	49	5	Monday	11	16:05	17:00	Social Studies	94	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19116	49	5	Tuesday	1	08:30	09:25	Telugu	108	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19117	49	5	Tuesday	2	09:25	10:20	English	79	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19118	49	5	Tuesday	3	10:20	11:15	Hindi	98	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19119	49	5	Tuesday	5	11:30	12:25	Social Studies	94	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19120	49	5	Tuesday	6	12:25	13:20	English	79	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19121	49	5	Tuesday	8	14:05	15:00	Mathematics	91	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19122	49	5	Tuesday	9	15:00	15:55	Telugu	174	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19123	49	5	Tuesday	11	16:05	17:00	Hindi	98	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19124	49	5	Wednesday	1	08:30	09:25	Telugu	174	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19125	49	5	Wednesday	2	09:25	10:20	Social Studies	94	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19126	49	5	Wednesday	3	10:20	11:15	English	79	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19127	49	5	Wednesday	5	11:30	12:25	Mathematics	91	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19128	49	5	Wednesday	6	12:25	13:20	Social Studies	94	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19129	49	5	Wednesday	8	14:05	15:00	Telugu	174	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19130	49	5	Wednesday	9	15:00	15:55	English	79	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19131	49	5	Wednesday	11	16:05	17:00	Hindi	98	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19132	49	5	Thursday	1	08:30	09:25	Hindi	98	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19133	49	5	Thursday	2	09:25	10:20	Mathematics	91	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19134	49	5	Thursday	3	10:20	11:15	Social Studies	94	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19135	49	5	Thursday	5	11:30	12:25	Telugu	174	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19136	49	5	Thursday	6	12:25	13:20	English	96	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19137	49	5	Thursday	8	14:05	15:00	Hindi	98	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19138	49	5	Thursday	9	15:00	15:55	Mathematics	91	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19139	49	5	Thursday	11	16:05	17:00	Mathematics	91	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19140	49	5	Friday	1	08:30	09:25	Social Studies	94	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19141	49	5	Friday	2	09:25	10:20	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19142	49	5	Friday	3	10:20	11:15	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19143	49	5	Friday	5	11:30	12:25	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19144	49	5	Friday	6	12:25	13:20	Mathematics	91	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19145	49	5	Friday	8	14:05	15:00	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19146	49	5	Friday	9	15:00	15:55	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19147	49	5	Friday	11	16:05	17:00	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19148	49	5	Saturday	1	08:30	09:25	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19149	49	5	Saturday	2	09:25	10:20	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19150	49	5	Saturday	3	10:20	11:15	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19151	49	5	Saturday	5	11:30	12:25	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19152	49	5	Saturday	6	12:25	13:20	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19153	49	5	Saturday	8	14:05	15:00	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19154	49	5	Saturday	9	15:00	15:55	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19155	49	5	Saturday	11	16:05	17:00	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19156	61	5	Monday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19157	61	5	Monday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19158	61	5	Monday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19159	61	5	Tuesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19160	61	5	Tuesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19161	61	5	Tuesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19162	61	5	Wednesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19163	61	5	Wednesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19164	61	5	Wednesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19165	61	5	Thursday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19166	61	5	Thursday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19167	61	5	Thursday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19168	61	5	Friday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19169	61	5	Friday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19170	61	5	Friday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19171	61	5	Saturday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19172	61	5	Saturday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19173	61	5	Saturday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19174	61	5	Monday	1	08:30	09:25	Mathematics	91	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19175	61	5	Monday	2	09:25	10:20	Hindi	98	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19176	61	5	Monday	3	10:20	11:15	Telugu	174	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19177	61	5	Monday	5	11:30	12:25	English	96	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19178	61	5	Monday	6	12:25	13:20	English	79	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19179	61	5	Monday	8	14:05	15:00	Telugu	108	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19180	61	5	Monday	9	15:00	15:55	English	79	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19181	61	5	Monday	11	16:05	17:00	Telugu	108	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19182	61	5	Tuesday	1	08:30	09:25	Telugu	174	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19183	61	5	Tuesday	2	09:25	10:20	Hindi	98	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19184	61	5	Tuesday	3	10:20	11:15	Telugu	108	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19185	61	5	Tuesday	5	11:30	12:25	English	79	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19186	61	5	Tuesday	6	12:25	13:20	Social Studies	94	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19187	61	5	Tuesday	8	14:05	15:00	Hindi	98	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19188	61	5	Tuesday	9	15:00	15:55	Mathematics	91	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19189	61	5	Tuesday	11	16:05	17:00	Telugu	108	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19190	61	5	Wednesday	1	08:30	09:25	English	79	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19191	61	5	Wednesday	2	09:25	10:20	Telugu	108	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19192	61	5	Wednesday	3	10:20	11:15	Hindi	98	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19193	61	5	Wednesday	5	11:30	12:25	English	96	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19194	61	5	Wednesday	6	12:25	13:20	Mathematics	91	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19195	61	5	Wednesday	8	14:05	15:00	English	79	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19196	61	5	Wednesday	9	15:00	15:55	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19197	61	5	Wednesday	11	16:05	17:00	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19198	61	5	Thursday	1	08:30	09:25	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19199	61	5	Thursday	2	09:25	10:20	Social Studies	94	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19200	61	5	Thursday	3	10:20	11:15	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19201	61	5	Thursday	5	11:30	12:25	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19202	61	5	Thursday	6	12:25	13:20	Hindi	98	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19203	61	5	Thursday	8	14:05	15:00	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19204	61	5	Thursday	9	15:00	15:55	Hindi	98	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19205	61	5	Thursday	11	16:05	17:00	Mathematics	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19206	61	5	Friday	1	08:30	09:25	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19207	61	5	Friday	2	09:25	10:20	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19208	61	5	Friday	3	10:20	11:15	Hindi	98	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19209	61	5	Friday	5	11:30	12:25	Social Studies	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19210	61	5	Friday	6	12:25	13:20	Social Studies	94	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19211	61	5	Friday	8	14:05	15:00	Mathematics	91	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19212	61	5	Friday	9	15:00	15:55	Mathematics	91	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19213	61	5	Friday	11	16:05	17:00	Social Studies	94	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19214	61	5	Saturday	1	08:30	09:25	Mathematics	91	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19215	61	5	Saturday	2	09:25	10:20	Social Studies	94	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19216	61	5	Saturday	3	10:20	11:15	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19217	61	5	Saturday	5	11:30	12:25	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19218	61	5	Saturday	6	12:25	13:20	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19219	61	5	Saturday	8	14:05	15:00	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19220	61	5	Saturday	9	15:00	15:55	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19221	61	5	Saturday	11	16:05	17:00	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19222	46	5	Monday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19223	46	5	Monday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19224	46	5	Monday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19225	46	5	Tuesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19226	46	5	Tuesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19227	46	5	Tuesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19228	46	5	Wednesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19229	46	5	Wednesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19230	46	5	Wednesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19231	46	5	Thursday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19232	46	5	Thursday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19233	46	5	Thursday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19234	46	5	Friday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19235	46	5	Friday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19236	46	5	Friday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19237	46	5	Saturday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19238	46	5	Saturday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19239	46	5	Saturday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19240	46	5	Monday	1	08:30	09:25	Social Studies	94	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19241	46	5	Monday	2	09:25	10:20	Mathematics	91	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19242	46	5	Monday	3	10:20	11:15	Social Studies	94	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19243	46	5	Monday	5	11:30	12:25	Telugu	174	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19244	46	5	Monday	6	12:25	13:20	English	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19245	46	5	Monday	8	14:05	15:00	Telugu	174	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19246	46	5	Monday	9	15:00	15:55	Hindi	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19247	46	5	Monday	11	16:05	17:00	Telugu	174	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19248	46	5	Tuesday	1	08:30	09:25	English	79	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19249	46	5	Tuesday	2	09:25	10:20	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19250	46	5	Tuesday	3	10:20	11:15	Telugu	174	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19251	46	5	Tuesday	5	11:30	12:25	Telugu	108	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19252	46	5	Tuesday	6	12:25	13:20	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19253	46	5	Tuesday	8	14:05	15:00	Telugu	174	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19254	46	5	Tuesday	9	15:00	15:55	English	79	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19255	46	5	Tuesday	11	16:05	17:00	Telugu	174	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19256	46	5	Wednesday	1	08:30	09:25	Hindi	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19257	46	5	Wednesday	2	09:25	10:20	English	79	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19258	46	5	Wednesday	3	10:20	11:15	Mathematics	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19259	46	5	Wednesday	5	11:30	12:25	Hindi	98	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19260	46	5	Wednesday	6	12:25	13:20	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19261	46	5	Wednesday	8	14:05	15:00	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19262	46	5	Wednesday	9	15:00	15:55	Mathematics	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19263	46	5	Wednesday	11	16:05	17:00	English	79	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19264	46	5	Thursday	1	08:30	09:25	English	79	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19265	46	5	Thursday	2	09:25	10:20	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19266	46	5	Thursday	3	10:20	11:15	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19267	46	5	Thursday	5	11:30	12:25	English	79	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19268	46	5	Thursday	6	12:25	13:20	Hindi	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19269	46	5	Thursday	8	14:05	15:00	Mathematics	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19270	46	5	Thursday	9	15:00	15:55	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19271	46	5	Thursday	11	16:05	17:00	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19272	46	5	Friday	1	08:30	09:25	Social Studies	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19273	46	5	Friday	2	09:25	10:20	Hindi	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19274	46	5	Friday	3	10:20	11:15	Mathematics	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19275	46	5	Friday	5	11:30	12:25	Hindi	98	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19276	46	5	Friday	6	12:25	13:20	Hindi	98	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19277	46	5	Friday	8	14:05	15:00	Social Studies	94	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19278	46	5	Friday	9	15:00	15:55	Social Studies	94	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19279	46	5	Friday	11	16:05	17:00	Mathematics	91	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19280	46	5	Saturday	1	08:30	09:25	Social Studies	94	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19281	46	5	Saturday	2	09:25	10:20	Mathematics	91	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19282	46	5	Saturday	3	10:20	11:15	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19283	46	5	Saturday	5	11:30	12:25	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19284	46	5	Saturday	6	12:25	13:20	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19285	46	5	Saturday	8	14:05	15:00	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19286	46	5	Saturday	9	15:00	15:55	Physical Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19287	46	5	Saturday	11	16:05	17:00	Biological Science	\N	Room 107	f	\N	2026-03-29 21:13:34.113325	f
19354	55	5	Monday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19355	55	5	Monday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19356	55	5	Monday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19357	55	5	Tuesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19358	55	5	Tuesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19359	55	5	Tuesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19360	55	5	Wednesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19361	55	5	Wednesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19362	55	5	Wednesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19363	55	5	Thursday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19364	55	5	Thursday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19365	55	5	Thursday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19366	55	5	Friday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19367	55	5	Friday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19368	55	5	Friday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19369	55	5	Saturday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19370	55	5	Saturday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19371	55	5	Saturday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19372	55	5	Monday	1	08:30	09:25	Mathematics	90	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19373	55	5	Monday	2	09:25	10:20	Social Studies	94	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19374	55	5	Monday	3	10:20	11:15	English	97	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19375	55	5	Monday	5	11:30	12:25	Mathematics	90	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19376	55	5	Monday	6	12:25	13:20	English	97	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19377	55	5	Monday	8	14:05	15:00	Social Studies	94	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19378	55	5	Monday	9	15:00	15:55	English	97	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19379	55	5	Monday	11	16:05	17:00	Mathematics	90	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19380	55	5	Tuesday	1	08:30	09:25	Mathematics	90	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19381	55	5	Tuesday	2	09:25	10:20	English	97	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19382	55	5	Tuesday	3	10:20	11:15	Mathematics	90	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19383	55	5	Tuesday	5	11:30	12:25	Social Studies	95	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19384	55	5	Tuesday	6	12:25	13:20	Social Studies	95	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19385	55	5	Tuesday	8	14:05	15:00	Mathematics	90	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19386	55	5	Tuesday	9	15:00	15:55	English	97	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19387	55	5	Tuesday	11	16:05	17:00	English	97	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19388	55	5	Wednesday	1	08:30	09:25	English	97	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19389	55	5	Wednesday	2	09:25	10:20	Social Studies	95	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19390	55	5	Wednesday	3	10:20	11:15	Mathematics	90	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19391	55	5	Wednesday	5	11:30	12:25	Social Studies	95	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19392	55	5	Wednesday	6	12:25	13:20	Telugu	108	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19393	55	5	Wednesday	8	14:05	15:00	Hindi	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19394	55	5	Wednesday	9	15:00	15:55	Telugu	174	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19395	55	5	Wednesday	11	16:05	17:00	Telugu	108	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19396	55	5	Thursday	1	08:30	09:25	Physical Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19397	55	5	Thursday	2	09:25	10:20	Telugu	174	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19398	55	5	Thursday	3	10:20	11:15	Telugu	108	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19399	55	5	Thursday	5	11:30	12:25	Biological Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19400	55	5	Thursday	6	12:25	13:20	Hindi	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19401	55	5	Thursday	8	14:05	15:00	Telugu	174	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19402	55	5	Thursday	9	15:00	15:55	Physical Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19403	55	5	Thursday	11	16:05	17:00	Telugu	108	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19404	55	5	Friday	1	08:30	09:25	Biological Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19405	55	5	Friday	2	09:25	10:20	Hindi	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19406	55	5	Friday	3	10:20	11:15	Physical Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19407	55	5	Friday	5	11:30	12:25	Biological Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19408	55	5	Friday	6	12:25	13:20	Hindi	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19409	55	5	Friday	8	14:05	15:00	Physical Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19410	55	5	Friday	9	15:00	15:55	Biological Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19411	55	5	Friday	11	16:05	17:00	Hindi	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19412	55	5	Saturday	1	08:30	09:25	Hindi	98	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19413	55	5	Saturday	2	09:25	10:20	Hindi	98	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19414	55	5	Saturday	3	10:20	11:15	Physical Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19415	55	5	Saturday	5	11:30	12:25	Biological Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19416	55	5	Saturday	6	12:25	13:20	Physical Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19417	55	5	Saturday	8	14:05	15:00	Biological Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19418	55	5	Saturday	9	15:00	15:55	Physical Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19419	55	5	Saturday	11	16:05	17:00	Biological Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19420	48	5	Monday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19421	48	5	Monday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19422	48	5	Monday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19423	48	5	Tuesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19424	48	5	Tuesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19425	48	5	Tuesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19426	48	5	Wednesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19427	48	5	Wednesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19428	48	5	Wednesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19429	48	5	Thursday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19430	48	5	Thursday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19431	48	5	Thursday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19432	48	5	Friday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19433	48	5	Friday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19434	48	5	Friday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19435	48	5	Saturday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19436	48	5	Saturday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19437	48	5	Saturday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19438	48	5	Monday	1	08:30	09:25	Telugu	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19439	48	5	Monday	2	09:25	10:20	English	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19440	48	5	Monday	3	10:20	11:15	Hindi	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19441	48	5	Monday	5	11:30	12:25	Mathematics	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19442	48	5	Monday	6	12:25	13:20	Physical Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19443	48	5	Monday	8	14:05	15:00	Biological Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19444	48	5	Monday	9	15:00	15:55	Telugu	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19445	48	5	Monday	11	16:05	17:00	English	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19446	48	5	Tuesday	1	08:30	09:25	Hindi	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19447	48	5	Tuesday	2	09:25	10:20	Mathematics	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19448	48	5	Tuesday	3	10:20	11:15	Physical Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19449	48	5	Tuesday	5	11:30	12:25	Biological Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19450	48	5	Tuesday	6	12:25	13:20	Social Studies	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19451	48	5	Tuesday	8	14:05	15:00	Telugu	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19452	48	5	Tuesday	9	15:00	15:55	English	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19453	48	5	Tuesday	11	16:05	17:00	Hindi	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19454	48	5	Wednesday	1	08:30	09:25	Mathematics	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19455	48	5	Wednesday	2	09:25	10:20	Physical Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19456	48	5	Wednesday	3	10:20	11:15	Biological Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19457	48	5	Wednesday	5	11:30	12:25	Social Studies	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19458	48	5	Wednesday	6	12:25	13:20	Telugu	174	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19459	48	5	Wednesday	8	14:05	15:00	English	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19460	48	5	Wednesday	9	15:00	15:55	Hindi	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19461	48	5	Wednesday	11	16:05	17:00	Telugu	174	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19462	48	5	Thursday	1	08:30	09:25	Mathematics	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19463	48	5	Thursday	2	09:25	10:20	Physical Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19464	48	5	Thursday	3	10:20	11:15	Telugu	174	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19465	48	5	Thursday	5	11:30	12:25	Biological Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19466	48	5	Thursday	6	12:25	13:20	Social Studies	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19467	48	5	Thursday	8	14:05	15:00	English	79	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19468	48	5	Thursday	9	15:00	15:55	Hindi	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19469	48	5	Thursday	11	16:05	17:00	Telugu	174	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19470	48	5	Friday	1	08:30	09:25	English	79	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19471	48	5	Friday	2	09:25	10:20	English	79	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19472	48	5	Friday	3	10:20	11:15	Mathematics	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19473	48	5	Friday	5	11:30	12:25	Physical Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19474	48	5	Friday	6	12:25	13:20	Biological Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19475	48	5	Friday	8	14:05	15:00	Social Studies	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19476	48	5	Friday	9	15:00	15:55	Hindi	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19477	48	5	Friday	11	16:05	17:00	Mathematics	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19478	48	5	Saturday	1	08:30	09:25	Physical Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19479	48	5	Saturday	2	09:25	10:20	Biological Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19480	48	5	Saturday	3	10:20	11:15	Social Studies	94	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19481	48	5	Saturday	5	11:30	12:25	Hindi	98	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19482	48	5	Saturday	6	12:25	13:20	Mathematics	91	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19483	48	5	Saturday	8	14:05	15:00	Social Studies	94	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19484	48	5	Saturday	9	15:00	15:55	Physical Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19485	48	5	Saturday	11	16:05	17:00	Biological Science	\N	Room 108	f	\N	2026-03-29 21:13:34.113325	f
19486	56	5	Monday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19487	56	5	Monday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19488	56	5	Monday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19489	56	5	Tuesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19490	56	5	Tuesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19491	56	5	Tuesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19492	56	5	Wednesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19493	56	5	Wednesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19494	56	5	Wednesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19495	56	5	Thursday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19496	56	5	Thursday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19497	56	5	Thursday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19498	56	5	Friday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19499	56	5	Friday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19500	56	5	Friday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19501	56	5	Saturday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19502	56	5	Saturday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19503	56	5	Saturday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19504	56	5	Monday	1	08:30	09:25	Hindi	99	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19505	56	5	Monday	2	09:25	10:20	Social Studies	95	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19506	56	5	Monday	3	10:20	11:15	Mathematics	90	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19507	56	5	Monday	5	11:30	12:25	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
19508	56	5	Monday	6	12:25	13:20	Hindi	99	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19509	56	5	Monday	8	14:05	15:00	English	97	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19510	56	5	Monday	9	15:00	15:55	Mathematics	90	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19511	56	5	Monday	11	16:05	17:00	Social Studies	95	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19512	56	5	Tuesday	1	08:30	09:25	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
19513	56	5	Tuesday	2	09:25	10:20	Hindi	99	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19514	56	5	Tuesday	3	10:20	11:15	English	97	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19515	56	5	Tuesday	5	11:30	12:25	Mathematics	90	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19516	56	5	Tuesday	6	12:25	13:20	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
19517	56	5	Tuesday	8	14:05	15:00	Social Studies	95	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19518	56	5	Tuesday	9	15:00	15:55	Social Studies	95	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19519	56	5	Tuesday	11	16:05	17:00	Hindi	99	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19520	56	5	Wednesday	1	08:30	09:25	Mathematics	90	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19521	56	5	Wednesday	2	09:25	10:20	English	97	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19522	56	5	Wednesday	3	10:20	11:15	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
19523	56	5	Wednesday	5	11:30	12:25	Hindi	99	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19524	56	5	Wednesday	6	12:25	13:20	English	97	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19525	56	5	Wednesday	8	14:05	15:00	Mathematics	90	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19526	56	5	Wednesday	9	15:00	15:55	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
19527	56	5	Wednesday	11	16:05	17:00	Social Studies	95	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19528	56	5	Thursday	1	08:30	09:25	Hindi	99	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19529	56	5	Thursday	2	09:25	10:20	Mathematics	90	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19530	56	5	Thursday	3	10:20	11:15	English	97	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19531	56	5	Thursday	5	11:30	12:25	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
19532	56	5	Thursday	6	12:25	13:20	English	97	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19533	56	5	Thursday	8	14:05	15:00	Social Studies	95	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19534	56	5	Thursday	9	15:00	15:55	Telugu	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19535	56	5	Thursday	11	16:05	17:00	Physical Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19536	56	5	Friday	1	08:30	09:25	Telugu	108	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19537	56	5	Friday	2	09:25	10:20	Telugu	108	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19538	56	5	Friday	3	10:20	11:15	Telugu	108	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19539	56	5	Friday	5	11:30	12:25	Telugu	108	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19540	56	5	Friday	6	12:25	13:20	Telugu	108	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19541	56	5	Friday	8	14:05	15:00	Biological Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19542	56	5	Friday	9	15:00	15:55	Physical Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19543	56	5	Friday	11	16:05	17:00	Biological Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19544	56	5	Saturday	1	08:30	09:25	Physical Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19545	56	5	Saturday	2	09:25	10:20	Biological Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19546	56	5	Saturday	3	10:20	11:15	Physical Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19547	56	5	Saturday	5	11:30	12:25	Biological Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19548	56	5	Saturday	6	12:25	13:20	Physical Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19549	56	5	Saturday	8	14:05	15:00	Biological Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19550	56	5	Saturday	9	15:00	15:55	Physical Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19551	56	5	Saturday	11	16:05	17:00	Biological Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19552	44	5	Monday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19553	44	5	Monday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19554	44	5	Monday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19555	44	5	Tuesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19556	44	5	Tuesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19557	44	5	Tuesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19558	44	5	Wednesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19559	44	5	Wednesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19560	44	5	Wednesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19561	44	5	Thursday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19562	44	5	Thursday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19563	44	5	Thursday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19564	44	5	Friday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19565	44	5	Friday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19566	44	5	Friday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19567	44	5	Saturday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19568	44	5	Saturday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19569	44	5	Saturday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19570	44	5	Monday	1	08:30	09:25	Social Studies	95	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19571	44	5	Monday	2	09:25	10:20	Hindi	99	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19572	44	5	Monday	3	10:20	11:15	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
19573	44	5	Monday	5	11:30	12:25	Hindi	99	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19574	44	5	Monday	6	12:25	13:20	Social Studies	95	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19575	44	5	Monday	8	14:05	15:00	Mathematics	90	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19576	44	5	Monday	9	15:00	15:55	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
19577	44	5	Monday	11	16:05	17:00	Hindi	99	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19578	44	5	Tuesday	1	08:30	09:25	Social Studies	95	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19579	44	5	Tuesday	2	09:25	10:20	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
19580	44	5	Tuesday	3	10:20	11:15	Hindi	99	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19581	44	5	Tuesday	5	11:30	12:25	English	97	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19582	44	5	Tuesday	6	12:25	13:20	Mathematics	90	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19583	44	5	Tuesday	8	14:05	15:00	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
19584	44	5	Tuesday	9	15:00	15:55	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
19585	44	5	Tuesday	11	16:05	17:00	Mathematics	90	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19586	44	5	Wednesday	1	08:30	09:25	Hindi	99	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19587	44	5	Wednesday	2	09:25	10:20	Mathematics	90	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19588	44	5	Wednesday	3	10:20	11:15	Social Studies	95	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19589	44	5	Wednesday	5	11:30	12:25	Mathematics	90	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19590	44	5	Wednesday	6	12:25	13:20	Social Studies	95	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19591	44	5	Wednesday	8	14:05	15:00	English	97	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19592	44	5	Wednesday	9	15:00	15:55	Hindi	99	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19593	44	5	Wednesday	11	16:05	17:00	English	97	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19594	44	5	Thursday	1	08:30	09:25	Mathematics	90	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19595	44	5	Thursday	2	09:25	10:20	Social Studies	95	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19596	44	5	Thursday	3	10:20	11:15	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
19597	44	5	Thursday	5	11:30	12:25	English	97	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19598	44	5	Thursday	6	12:25	13:20	Telugu	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19599	44	5	Thursday	8	14:05	15:00	English	97	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19600	44	5	Thursday	9	15:00	15:55	English	97	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19601	44	5	Thursday	11	16:05	17:00	Physical Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19602	44	5	Friday	1	08:30	09:25	Telugu	174	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19603	44	5	Friday	2	09:25	10:20	Telugu	174	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19604	44	5	Friday	3	10:20	11:15	Telugu	174	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19605	44	5	Friday	5	11:30	12:25	Telugu	174	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19606	44	5	Friday	6	12:25	13:20	Telugu	174	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19607	44	5	Friday	8	14:05	15:00	Biological Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19608	44	5	Friday	9	15:00	15:55	Physical Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19609	44	5	Friday	11	16:05	17:00	Biological Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19610	44	5	Saturday	1	08:30	09:25	Physical Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19611	44	5	Saturday	2	09:25	10:20	Biological Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19612	44	5	Saturday	3	10:20	11:15	Physical Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19613	44	5	Saturday	5	11:30	12:25	Biological Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19614	44	5	Saturday	6	12:25	13:20	Physical Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19615	44	5	Saturday	8	14:05	15:00	Biological Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19616	44	5	Saturday	9	15:00	15:55	Physical Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19617	44	5	Saturday	11	16:05	17:00	Biological Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19618	50	5	Monday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19619	50	5	Monday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19620	50	5	Monday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19621	50	5	Tuesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19622	50	5	Tuesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19623	50	5	Tuesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19624	50	5	Wednesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19625	50	5	Wednesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19626	50	5	Wednesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19627	50	5	Thursday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19628	50	5	Thursday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19629	50	5	Thursday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19630	50	5	Friday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19631	50	5	Friday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19632	50	5	Friday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19633	50	5	Saturday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:13:34.113325	f
19634	50	5	Saturday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:13:34.113325	f
19635	50	5	Saturday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:13:34.113325	f
19636	50	5	Monday	1	08:30	09:25	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
19637	50	5	Monday	2	09:25	10:20	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
19638	50	5	Monday	3	10:20	11:15	Telugu	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19639	50	5	Monday	5	11:30	12:25	English	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19640	50	5	Monday	6	12:25	13:20	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
19641	50	5	Monday	8	14:05	15:00	Hindi	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19642	50	5	Monday	9	15:00	15:55	Mathematics	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19643	50	5	Monday	11	16:05	17:00	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
19644	50	5	Tuesday	1	08:30	09:25	Physical Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19645	50	5	Tuesday	2	09:25	10:20	Biological Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19646	50	5	Tuesday	3	10:20	11:15	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
19647	50	5	Tuesday	5	11:30	12:25	Social Studies	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19648	50	5	Tuesday	6	12:25	13:20	Telugu	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19649	50	5	Tuesday	8	14:05	15:00	English	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19650	50	5	Tuesday	9	15:00	15:55	Hindi	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19651	50	5	Tuesday	11	16:05	17:00	Computer Science	100	Computer Lab	f	\N	2026-03-29 21:13:34.113325	f
19652	50	5	Wednesday	1	08:30	09:25	Mathematics	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19653	50	5	Wednesday	2	09:25	10:20	Physical Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19654	50	5	Wednesday	3	10:20	11:15	Biological Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19655	50	5	Wednesday	5	11:30	12:25	Social Studies	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19656	50	5	Wednesday	6	12:25	13:20	Telugu	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19657	50	5	Wednesday	8	14:05	15:00	English	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19658	50	5	Wednesday	9	15:00	15:55	Hindi	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19659	50	5	Wednesday	11	16:05	17:00	Mathematics	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19660	50	5	Thursday	1	08:30	09:25	Physical Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19661	50	5	Thursday	2	09:25	10:20	Biological Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19662	50	5	Thursday	3	10:20	11:15	Social Studies	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19663	50	5	Thursday	5	11:30	12:25	Telugu	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19664	50	5	Thursday	6	12:25	13:20	English	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19665	50	5	Thursday	8	14:05	15:00	Hindi	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19666	50	5	Thursday	9	15:00	15:55	Mathematics	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19667	50	5	Thursday	11	16:05	17:00	Physical Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19668	50	5	Friday	1	08:30	09:25	Biological Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19669	50	5	Friday	2	09:25	10:20	Social Studies	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19670	50	5	Friday	3	10:20	11:15	English	79	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19671	50	5	Friday	5	11:30	12:25	English	79	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19672	50	5	Friday	6	12:25	13:20	Telugu	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19673	50	5	Friday	8	14:05	15:00	Telugu	108	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19674	50	5	Friday	9	15:00	15:55	Hindi	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19675	50	5	Friday	11	16:05	17:00	Mathematics	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19676	50	5	Saturday	1	08:30	09:25	Physical Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19677	50	5	Saturday	2	09:25	10:20	Biological Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19678	50	5	Saturday	3	10:20	11:15	Hindi	98	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19679	50	5	Saturday	5	11:30	12:25	Social Studies	94	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19680	50	5	Saturday	6	12:25	13:20	Social Studies	94	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19681	50	5	Saturday	8	14:05	15:00	Mathematics	91	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19682	50	5	Saturday	9	15:00	15:55	Physical Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19683	50	5	Saturday	11	16:05	17:00	Biological Science	\N	Room 109	f	\N	2026-03-29 21:13:34.113325	f
19720	97	5	Wednesday	3	10:20	11:15	English	79	Room 101	f	\N	2026-03-29 21:30:18.208353	f
19730	97	5	Thursday	6	12:25	13:20	Telugu	174	Room 101	f	\N	2026-03-29 21:30:18.208353	f
19733	97	5	Thursday	11	16:05	17:00	Telugu	174	Room 101	f	\N	2026-03-29 21:30:18.208353	f
19738	97	5	Friday	6	12:25	13:20	Environmental Studies	\N	Room 101	f	\N	2026-03-29 21:30:18.208353	f
19741	97	5	Friday	11	16:05	17:00	Environmental Studies	\N	Room 101	f	\N	2026-03-29 21:30:18.208353	f
19744	97	5	Saturday	3	10:20	11:15	Environmental Studies	\N	Room 101	f	\N	2026-03-29 21:30:18.208353	f
19750	97	5	Monday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:33:25.683666	f
19751	97	5	Monday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:33:25.683666	f
19752	97	5	Monday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:33:25.683666	f
19753	97	5	Tuesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:33:25.683666	f
19754	97	5	Tuesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:33:25.683666	f
19755	97	5	Tuesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:33:25.683666	f
19756	97	5	Wednesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:33:25.683666	f
19757	97	5	Wednesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:33:25.683666	f
19758	97	5	Wednesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:33:25.683666	f
19759	97	5	Thursday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:33:25.683666	f
19760	97	5	Thursday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:33:25.683666	f
19761	97	5	Thursday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:33:25.683666	f
19762	97	5	Friday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:33:25.683666	f
19763	97	5	Friday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:33:25.683666	f
19764	97	5	Friday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:33:25.683666	f
19765	97	5	Saturday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:33:25.683666	f
19766	97	5	Saturday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:33:25.683666	f
19767	97	5	Saturday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:33:25.683666	f
19768	97	5	Monday	1	08:30	09:25	English	79	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19769	97	5	Monday	2	09:25	10:20	Telugu	174	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19770	97	5	Monday	3	10:20	11:15	Mathematics	91	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19771	97	5	Monday	5	11:30	12:25	English	79	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19772	97	5	Monday	6	12:25	13:20	Telugu	174	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19773	97	5	Monday	8	14:05	15:00	Mathematics	91	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19774	97	5	Monday	9	15:00	15:55	English	79	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19775	97	5	Monday	11	16:05	17:00	Telugu	174	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19776	97	5	Tuesday	1	08:30	09:25	Mathematics	91	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19777	97	5	Tuesday	2	09:25	10:20	English	79	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19778	97	5	Tuesday	3	10:20	11:15	Telugu	174	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19779	97	5	Tuesday	5	11:30	12:25	Mathematics	91	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19780	97	5	Tuesday	6	12:25	13:20	English	79	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19781	97	5	Tuesday	8	14:05	15:00	Telugu	174	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19782	97	5	Tuesday	9	15:00	15:55	Mathematics	91	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19783	97	5	Tuesday	11	16:05	17:00	English	79	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19784	97	5	Wednesday	1	08:30	09:25	Telugu	174	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19785	97	5	Wednesday	2	09:25	10:20	Mathematics	91	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19787	97	5	Wednesday	5	11:30	12:25	Telugu	174	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19788	97	5	Wednesday	6	12:25	13:20	Mathematics	91	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19789	97	5	Wednesday	8	14:05	15:00	English	79	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19790	97	5	Wednesday	9	15:00	15:55	Telugu	174	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19791	97	5	Wednesday	11	16:05	17:00	Mathematics	91	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19792	97	5	Thursday	1	08:30	09:25	English	79	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19793	97	5	Thursday	2	09:25	10:20	Telugu	174	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19794	97	5	Thursday	3	10:20	11:15	Mathematics	91	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19795	97	5	Thursday	5	11:30	12:25	English	79	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19797	97	5	Thursday	8	14:05	15:00	Mathematics	91	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19798	97	5	Thursday	9	15:00	15:55	English	79	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19800	97	5	Friday	1	08:30	09:25	Mathematics	91	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19801	97	5	Friday	2	09:25	10:20	English	79	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19802	97	5	Friday	3	10:20	11:15	Telugu	174	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19803	97	5	Friday	5	11:30	12:25	Mathematics	91	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19805	97	5	Friday	8	14:05	15:00	Environmental Studies	\N	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19806	97	5	Friday	9	15:00	15:55	Environmental Studies	\N	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19808	97	5	Saturday	1	08:30	09:25	Environmental Studies	\N	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19809	97	5	Saturday	2	09:25	10:20	Environmental Studies	\N	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19811	97	5	Saturday	5	11:30	12:25	Environmental Studies	\N	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19812	97	5	Saturday	6	12:25	13:20	Environmental Studies	\N	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19813	97	5	Saturday	8	14:05	15:00	Environmental Studies	\N	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19814	97	5	Saturday	9	15:00	15:55	Environmental Studies	\N	Room 101	f	\N	2026-03-29 21:33:25.683666	f
19815	97	5	Saturday	11	16:05	17:00	Environmental Studies	\N	Room 101	f	\N	2026-03-29 21:33:25.683666	f
20014	43	5	Monday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:33:45.50481	f
20015	43	5	Monday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:33:45.50481	f
20016	43	5	Monday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:33:45.50481	f
20017	43	5	Tuesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:33:45.50481	f
20018	43	5	Tuesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:33:45.50481	f
20019	43	5	Tuesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:33:45.50481	f
20020	43	5	Wednesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:33:45.50481	f
20021	43	5	Wednesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:33:45.50481	f
20022	43	5	Wednesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:33:45.50481	f
20023	43	5	Thursday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:33:45.50481	f
20024	43	5	Thursday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:33:45.50481	f
20025	43	5	Thursday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:33:45.50481	f
20026	43	5	Friday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:33:45.50481	f
20027	43	5	Friday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:33:45.50481	f
20028	43	5	Friday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:33:45.50481	f
20029	43	5	Saturday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-29 21:33:45.50481	f
20030	43	5	Saturday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-29 21:33:45.50481	f
20031	43	5	Saturday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-29 21:33:45.50481	f
20032	43	5	Monday	1	08:30	09:25	Telugu	108	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20033	43	5	Monday	2	09:25	10:20	English	79	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20034	43	5	Monday	3	10:20	11:15	Hindi	98	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20035	43	5	Monday	5	11:30	12:25	Mathematics	91	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20036	43	5	Monday	6	12:25	13:20	Social Studies	94	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20037	43	5	Monday	8	14:05	15:00	dance	86	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20038	43	5	Monday	9	15:00	15:55	Telugu	108	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20039	43	5	Monday	11	16:05	17:00	dance	86	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20040	43	5	Tuesday	1	08:30	09:25	English	79	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20041	43	5	Tuesday	2	09:25	10:20	Hindi	98	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20042	43	5	Tuesday	3	10:20	11:15	Mathematics	91	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20043	43	5	Tuesday	5	11:30	12:25	Social Studies	94	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20044	43	5	Tuesday	6	12:25	13:20	Telugu	108	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20045	43	5	Tuesday	8	14:05	15:00	dance	86	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20046	43	5	Tuesday	9	15:00	15:55	English	79	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20047	43	5	Tuesday	11	16:05	17:00	dance	86	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20048	43	5	Wednesday	1	08:30	09:25	Hindi	98	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20049	43	5	Wednesday	2	09:25	10:20	Mathematics	91	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20050	43	5	Wednesday	3	10:20	11:15	Social Studies	94	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20051	43	5	Wednesday	5	11:30	12:25	Telugu	108	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20052	43	5	Wednesday	6	12:25	13:20	English	79	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20053	43	5	Wednesday	8	14:05	15:00	dance	86	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20054	43	5	Wednesday	9	15:00	15:55	Hindi	98	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20055	43	5	Wednesday	11	16:05	17:00	dance	86	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20056	43	5	Thursday	1	08:30	09:25	Mathematics	91	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20057	43	5	Thursday	2	09:25	10:20	Social Studies	94	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20058	43	5	Thursday	3	10:20	11:15	Telugu	108	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20059	43	5	Thursday	5	11:30	12:25	English	79	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20060	43	5	Thursday	6	12:25	13:20	Hindi	98	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20061	43	5	Thursday	8	14:05	15:00	Mathematics	91	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20062	43	5	Thursday	9	15:00	15:55	Social Studies	94	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20063	43	5	Thursday	11	16:05	17:00	Telugu	108	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20064	43	5	Friday	1	08:30	09:25	English	79	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20065	43	5	Friday	2	09:25	10:20	Hindi	98	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20066	43	5	Friday	3	10:20	11:15	Mathematics	91	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20067	43	5	Friday	5	11:30	12:25	Social Studies	94	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20068	43	5	Friday	6	12:25	13:20	Physical Science	\N	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20069	43	5	Friday	8	14:05	15:00	Biological Science	\N	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20070	43	5	Friday	9	15:00	15:55	Physical Science	\N	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20071	43	5	Friday	11	16:05	17:00	Biological Science	\N	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20072	43	5	Saturday	1	08:30	09:25	Physical Science	\N	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20073	43	5	Saturday	2	09:25	10:20	Biological Science	\N	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20074	43	5	Saturday	3	10:20	11:15	Physical Science	\N	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20075	43	5	Saturday	5	11:30	12:25	Biological Science	\N	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20076	43	5	Saturday	6	12:25	13:20	Physical Science	\N	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20077	43	5	Saturday	8	14:05	15:00	Biological Science	\N	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20078	43	5	Saturday	9	15:00	15:55	Physical Science	\N	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20079	43	5	Saturday	11	16:05	17:00	Biological Science	\N	Room 108	f	\N	2026-03-29 21:33:45.50481	f
20080	96	5	Monday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-31 19:39:10.297776	f
20081	96	5	Monday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-31 19:39:10.297776	f
20082	96	5	Monday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-31 19:39:10.297776	f
20083	96	5	Tuesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-31 19:39:10.297776	f
20084	96	5	Tuesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-31 19:39:10.297776	f
20085	96	5	Tuesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-31 19:39:10.297776	f
20086	96	5	Wednesday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-31 19:39:10.297776	f
20087	96	5	Wednesday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-31 19:39:10.297776	f
20088	96	5	Wednesday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-31 19:39:10.297776	f
20089	96	5	Thursday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-31 19:39:10.297776	f
20090	96	5	Thursday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-31 19:39:10.297776	f
20091	96	5	Thursday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-31 19:39:10.297776	f
20092	96	5	Friday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-31 19:39:10.297776	f
20093	96	5	Friday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-31 19:39:10.297776	f
20094	96	5	Friday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-31 19:39:10.297776	f
20095	96	5	Saturday	4	11:15	11:30	\N	\N	\N	t	Morning Break	2026-03-31 19:39:10.297776	f
20096	96	5	Saturday	7	13:20	14:05	\N	\N	\N	t	Lunch Break	2026-03-31 19:39:10.297776	f
20097	96	5	Saturday	10	15:55	16:05	\N	\N	\N	t	Afternoon Break	2026-03-31 19:39:10.297776	f
20098	96	5	Monday	1	08:30	09:25	English	79	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20099	96	5	Monday	2	09:25	10:20	Mathematics	91	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20100	96	5	Monday	3	10:20	11:15	Telugu	174	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20101	96	5	Monday	5	11:30	12:25	Hindi	98	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20102	96	5	Monday	6	12:25	13:20	Environmental Science	100	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20103	96	5	Monday	8	14:05	15:00	Physical Education	102	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20104	96	5	Monday	9	15:00	15:55	English	79	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20105	96	5	Monday	11	16:05	17:00	Physical Education	102	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20106	96	5	Tuesday	1	08:30	09:25	Mathematics	91	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20107	96	5	Tuesday	2	09:25	10:20	Telugu	174	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20108	96	5	Tuesday	3	10:20	11:15	Hindi	98	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20109	96	5	Tuesday	5	11:30	12:25	Environmental Science	100	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20110	96	5	Tuesday	6	12:25	13:20	English	79	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20111	96	5	Tuesday	8	14:05	15:00	Physical Education	102	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20112	96	5	Tuesday	9	15:00	15:55	Mathematics	91	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20113	96	5	Tuesday	11	16:05	17:00	Physical Education	102	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20114	96	5	Wednesday	1	08:30	09:25	Telugu	174	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20115	96	5	Wednesday	2	09:25	10:20	Hindi	98	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20116	96	5	Wednesday	3	10:20	11:15	Environmental Science	100	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20117	96	5	Wednesday	5	11:30	12:25	English	79	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20118	96	5	Wednesday	6	12:25	13:20	Mathematics	91	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20119	96	5	Wednesday	8	14:05	15:00	Physical Education	102	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20120	96	5	Wednesday	9	15:00	15:55	Telugu	174	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20121	96	5	Wednesday	11	16:05	17:00	Physical Education	102	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20122	96	5	Thursday	1	08:30	09:25	Hindi	98	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20123	96	5	Thursday	2	09:25	10:20	Environmental Science	100	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20124	96	5	Thursday	3	10:20	11:15	English	79	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20125	96	5	Thursday	5	11:30	12:25	Mathematics	91	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20126	96	5	Thursday	6	12:25	13:20	Telugu	174	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20127	96	5	Thursday	8	14:05	15:00	Physical Education	102	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20128	96	5	Thursday	9	15:00	15:55	Hindi	98	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20129	96	5	Thursday	11	16:05	17:00	Environmental Science	100	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20130	96	5	Friday	1	08:30	09:25	English	79	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20131	96	5	Friday	2	09:25	10:20	Mathematics	91	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20132	96	5	Friday	3	10:20	11:15	Telugu	174	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20133	96	5	Friday	5	11:30	12:25	Hindi	98	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20134	96	5	Friday	6	12:25	13:20	Environmental Science	100	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20135	96	5	Friday	8	14:05	15:00	English	79	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20136	96	5	Friday	9	15:00	15:55	Mathematics	91	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20137	96	5	Friday	11	16:05	17:00	Telugu	174	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20138	96	5	Saturday	1	08:30	09:25	Hindi	98	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20139	96	5	Saturday	2	09:25	10:20	Environmental Science	100	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20140	96	5	Saturday	3	10:20	11:15	Environmental Studies	\N	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20141	96	5	Saturday	5	11:30	12:25	Environmental Studies	\N	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20142	96	5	Saturday	6	12:25	13:20	Environmental Studies	\N	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20143	96	5	Saturday	8	14:05	15:00	Environmental Studies	\N	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20144	96	5	Saturday	9	15:00	15:55	Environmental Studies	\N	Room 102	f	\N	2026-03-31 19:39:10.297776	f
20145	96	5	Saturday	11	16:05	17:00	Environmental Studies	\N	Room 102	f	\N	2026-03-31 19:39:10.297776	f
\.


--
-- Data for Name: classes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.classes (id, school_id, grade, section, class_teacher_id, created_at, timetable_generated_at, timetable_generated_by) FROM stdin;
97	5	1	A	\N	2026-03-29 21:24:28.242191	2026-03-29 21:33:25.683666+05:30	auto
43	5	8	A	108	2026-03-20 15:07:46.145459	2026-03-29 21:33:45.50481+05:30	auto
96	5	2	A	\N	2026-03-29 21:14:46.11713	2026-03-31 19:39:10.297776+05:30	auto
95	5	5	A	106	2026-03-29 20:58:12.917195	\N	\N
52	5	11	A	\N	2026-03-20 15:07:46.145459	\N	\N
59	5	6	A	96	2026-03-20 16:44:11.947247	2026-03-29 21:13:34.113325+05:30	auto
48	5	8	C	80	2026-03-20 15:07:46.145459	2026-03-29 21:13:34.113325+05:30	auto
46	5	7	C	\N	2026-03-20 15:07:46.145459	2026-03-29 21:13:34.113325+05:30	auto
49	5	7	A	91	2026-03-20 15:07:46.145459	2026-03-29 21:13:34.113325+05:30	auto
55	5	8	B	92	2026-03-20 16:44:11.947247	2026-03-29 21:13:34.113325+05:30	auto
47	5	6	B	94	2026-03-20 15:07:46.145459	2026-03-29 21:13:34.113325+05:30	auto
45	5	10	A	95	2026-03-20 15:07:46.145459	2026-03-29 21:13:34.113325+05:30	auto
61	5	7	B	98	2026-03-20 16:44:11.947247	2026-03-29 21:13:34.113325+05:30	auto
51	5	10	B	99	2026-03-20 15:07:46.145459	2026-03-29 21:13:34.113325+05:30	auto
50	5	9	C	\N	2026-03-20 15:07:46.145459	2026-03-29 21:13:34.113325+05:30	auto
56	5	9	A	93	2026-03-20 16:44:11.947247	2026-03-29 21:13:34.113325+05:30	auto
44	5	9	B	97	2026-03-20 15:07:46.145459	2026-03-29 21:13:34.113325+05:30	auto
\.


--
-- Data for Name: curriculum_assignments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.curriculum_assignments (id, school_id, grade, curriculum_type, created_at) FROM stdin;
23	5	8	APSSC	2026-03-20 23:28:34.785775
24	5	7	APSSC	2026-03-20 23:29:53.776005
25	5	6	APSSC	2026-03-20 23:29:58.677763
26	5	10	APSSC	2026-03-20 23:30:02.84774
43	5	11	APSSC	2026-03-29 20:57:26.605739
44	5	5	APSSC	2026-03-29 20:57:42.151161
46	5	2	CBSE	2026-03-29 21:14:18.736539
\.


--
-- Data for Name: daily_newspapers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.daily_newspapers (id, school_id, date, title, subtitle, content, fun_fact, quiz_question, quiz_answer, topic, category, created_at) FROM stdin;
1	5	2026-03-28	The Moon Landing: One Giant Leap for Mankind	How humanity first set foot on another world	On July 20, 1969, NASA's Apollo 11 mission landed humans on the Moon for the first time. Astronauts Neil Armstrong and Buzz Aldrin spent 2.5 hours on the lunar surface while Michael Collins orbited above. The mission was born from President Kennedy's 1961 challenge to land on the Moon before the decade's end, during the Space Race with the Soviet Union. The Saturn V rocket remains the most powerful ever built, generating 34.5 million newtons of thrust. The mission computer had less processing power than a modern smartwatch. Six Apollo missions landed a total of 12 astronauts on the Moon between 1969 and 1972. They brought back 382 kg of lunar rock samples.	Neil Armstrong's heartbeat reached 150 beats per minute as he manually guided the lunar module to avoid a crater full of boulders — they landed with only 20 seconds of fuel remaining!	Who was the first human to set foot on the Moon?	Neil Armstrong	Space	Science & Tech	2026-03-28 14:25:14.870708+05:30
2	5	2026-03-31	World War II: The Conflict That Shaped Our World	The deadliest conflict in human history and its lasting impact	World War II (1939-1945) involved over 30 countries and caused an estimated 70-85 million deaths — 3% of the world's 1940 population. It began when Nazi Germany, under Adolf Hitler, invaded Poland. The Holocaust resulted in the systematic murder of 6 million Jews and 5-6 million others. The United States joined after Japan's surprise attack on Pearl Harbor in December 1941. Key turning points included the Battle of Stalingrad (1942-43), D-Day Normandy landings (June 1944), and Allied advance from both east and west. The war ended in Europe in May 1945 and in Asia in September after the US dropped atomic bombs on Hiroshima and Nagasaki.	During WWII, the US, UK, and Soviet Union were allies — despite being ideological opposites — purely out of necessity to defeat Nazi Germany and Fascist Japan!	What event prompted the United States to enter World War II?	Japan's attack on Pearl Harbor	History	History & Culture	2026-03-31 20:08:00.406561+05:30
\.


--
-- Data for Name: doubt_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.doubt_messages (id, doubt_id, school_id, sender_type, sender_id, sender_name, message, created_at, is_final_answer) FROM stdin;
1	1	5	teacher	108	kowsik	hi preeti	2026-03-27 08:05:38.667943+05:30	f
2	1	5	student	17	Preeti Joshi	yes sir i have a doubt regading this	2026-03-27 08:06:22.777114+05:30	f
3	1	5	teacher	108	kowsik	ok i will clairfy in  school	2026-03-27 08:06:36.731945+05:30	f
4	1	5	student	17	Preeti Joshi	ok thnkas mam	2026-03-27 08:06:42.437852+05:30	f
5	2	5	teacher	90	Priya Sharma	hi	2026-03-27 08:09:26.741495+05:30	f
6	13	5	student	14	Divya Rao	hi	2026-03-27 21:51:15.946593+05:30	f
7	13	5	student	14	Divya Rao	hi	2026-03-27 21:51:18.452873+05:30	f
8	13	5	teacher	90	Priya Sharma	hi divya	2026-03-27 21:53:34.394598+05:30	f
9	13	5	teacher	90	Priya Sharma	what dobut	2026-03-27 21:53:58.078035+05:30	f
10	7	5	student	17	Preeti Joshi	pl	2026-03-27 21:54:39.297783+05:30	f
11	11	5	teacher	90	Priya Sharma	edfsvd	2026-03-27 21:54:53.386495+05:30	f
12	10	5	teacher	90	Priya Sharma	dfsv	2026-03-27 21:54:59.651395+05:30	f
13	5	5	teacher	90	Priya Sharma	defv	2026-03-27 21:55:06.139617+05:30	f
14	12	5	teacher	90	Priya Sharma	hi	2026-03-27 21:56:11.549106+05:30	f
15	12	5	student	14	Divya Rao	hi man havign doubt regaridng theorem	2026-03-27 21:56:28.930546+05:30	f
16	12	5	teacher	90	Priya Sharma	ok divya i will explain clearly4	2026-03-27 21:56:39.655371+05:30	f
17	12	5	teacher	90	Priya Sharma	bm,//v	2026-03-27 22:03:30.01411+05:30	t
18	12	5	student	14	Divya Rao	ftyuiop[7\\789	2026-03-27 22:03:54.10776+05:30	f
19	12	5	teacher	90	Priya Sharma	ftyuiop[7\\789	2026-03-27 22:04:47.769722+05:30	t
20	14	5	teacher	90	Priya Sharma	hi	2026-03-28 21:55:48.0517+05:30	f
21	14	5	teacher	90	Priya Sharma	what is the issue	2026-03-28 21:55:56.211018+05:30	f
\.


--
-- Data for Name: doubt_upvotes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.doubt_upvotes (id, doubt_id, student_id, school_id, created_at) FROM stdin;
2	5	14	5	2026-03-28 12:31:02.147785+05:30
3	10	11	5	2026-03-28 12:31:18.140528+05:30
4	11	20	5	2026-03-28 12:34:57.37275+05:30
5	10	20	5	2026-03-28 12:34:57.984982+05:30
6	11	17	5	2026-03-28 22:00:13.193608+05:30
\.


--
-- Data for Name: doubts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.doubts (id, school_id, class_id, student_id, subject, question, task_id, ai_answer, teacher_answer, answered_by, answered_at, status, created_at, last_message_at, resolved_at, resolved_by, message_count, closed_by_teacher, is_class_faq, faq_set_by, upvote_count) FROM stdin;
1	5	43	17	Telugu	kjhgfdgfdfgh	\N	\N	\N	108	2026-03-27 08:05:38.667+05:30	resolved	2026-03-27 08:04:52.643037+05:30	2026-03-27 08:06:42.436+05:30	2026-03-27 08:07:59.878+05:30	108	4	f	f	\N	0
2	5	43	17	Mathematics	wdefvdgdsfvd	\N	\N	\N	90	2026-03-27 08:09:26.74+05:30	resolved	2026-03-27 08:08:54.896978+05:30	2026-03-27 08:09:26.74+05:30	2026-03-27 08:28:53.649+05:30	\N	1	f	f	\N	0
3	5	43	17	Mathematics	lkjhgckjhv	1	\N	\N	\N	\N	open	2026-03-27 21:37:48.793852+05:30	\N	\N	\N	0	f	f	\N	0
4	5	43	17	Mathematics	lkjhgckjhv	1	\N	\N	\N	\N	open	2026-03-27 21:37:51.01383+05:30	\N	\N	\N	0	f	f	\N	0
6	5	43	17	Mathematics	lkjhgckjhv	3	\N	\N	\N	\N	open	2026-03-27 21:38:36.692376+05:30	\N	\N	\N	0	f	f	\N	0
9	5	43	17	Mathematics	lkjhgckjhv	\N	\N	\N	\N	\N	open	2026-03-27 21:38:45.023867+05:30	\N	\N	\N	0	f	f	\N	0
13	5	43	14	Mathematics	efsdghfhgwergthfjg	3	\N	\N	90	2026-03-27 21:53:34.393+05:30	in_progress	2026-03-27 21:42:38.163079+05:30	2026-03-27 21:53:58.076+05:30	\N	\N	4	f	f	\N	0
7	5	43	17	Mathematics	lkjhgckjhv	2	\N	\N	\N	\N	open	2026-03-27 21:38:40.201444+05:30	2026-03-27 21:54:39.297+05:30	\N	\N	1	f	f	\N	0
12	5	43	14	Mathematics	efsdghfhgwergthfjg	3	\N	\N	90	2026-03-27 21:56:11.548+05:30	resolved	2026-03-27 21:42:37.077269+05:30	2026-03-27 22:04:47.768+05:30	2026-03-27 22:05:03.147+05:30	\N	6	f	f	\N	0
5	5	43	17	Mathematics	lkjhgckjhv	1	\N	\N	90	2026-03-27 21:55:06.138+05:30	in_progress	2026-03-27 21:38:32.36314+05:30	2026-03-27 21:55:06.138+05:30	\N	\N	1	f	f	\N	1
14	5	43	17	Mathematics	regarding therom	\N	\N	\N	90	2026-03-28 21:55:48.051+05:30	in_progress	2026-03-28 21:55:09.232679+05:30	2026-03-28 21:55:56.21+05:30	\N	\N	2	f	f	\N	0
11	5	43	14	Mathematics	efsdghfhgwergthfjg	3	\N	\N	90	2026-03-27 21:54:53.385+05:30	in_progress	2026-03-27 21:42:36.023254+05:30	2026-03-27 21:54:53.385+05:30	\N	\N	1	f	f	\N	2
10	5	43	14	Mathematics	efsdghfhgwergthfjg	3	\N	\N	90	2026-03-27 21:54:59.65+05:30	in_progress	2026-03-27 21:42:33.626162+05:30	2026-03-27 21:54:59.65+05:30	\N	\N	1	f	f	\N	2
\.


--
-- Data for Name: exam_marks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exam_marks (id, exam_id, school_id, student_id, subject_name, marks_obtained, is_absent, entered_by, entered_at) FROM stdin;
1	2	5	11	Mathematics	56.00	f	90	2026-03-28 22:19:10.293689+05:30
2	2	5	14	Mathematics	90.00	f	90	2026-03-28 22:19:10.3084+05:30
3	2	5	17	Mathematics	45.00	f	90	2026-03-28 22:19:10.310305+05:30
4	2	5	20	Mathematics	67.00	f	90	2026-03-28 22:19:10.312304+05:30
\.


--
-- Data for Name: exam_records; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exam_records (id, school_id, class_id, created_by, exam_name, exam_type, exam_date, passing_pct, status, published_at, created_at, updated_at) FROM stdin;
1	5	43	108	unit test 1	unit_test	2026-03-30	35	collecting	\N	2026-03-28 21:15:57.176346+05:30	2026-03-28 21:15:59.657739+05:30
2	5	43	108	fd	mid_term	2026-03-31	35	collecting	\N	2026-03-28 22:10:49.539288+05:30	2026-03-28 22:10:52.172159+05:30
\.


--
-- Data for Name: exam_subjects; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.exam_subjects (id, exam_id, school_id, subject_name, teacher_id, teacher_name, max_marks, status, submitted_at, submitted_by) FROM stdin;
1	1	5	English	79	Suresh Kumar	100	pending	\N	\N
2	1	5	Mathematics	91	Amit Verma	100	pending	\N	\N
3	1	5	Telugu	108	kowsik	100	pending	\N	\N
4	2	5	Biological Science	\N	\N	100	pending	\N	\N
5	2	5	English	96	Anita Singh	100	pending	\N	\N
6	2	5	Hindi	99	Suresh Nair	100	pending	\N	\N
8	2	5	Physical Science	\N	\N	100	pending	\N	\N
9	2	5	Social Studies	95	Ramesh Iyer	100	pending	\N	\N
7	2	5	Mathematics	90	Priya Sharma	100	submitted	2026-03-28 22:19:10.329623+05:30	90
\.


--
-- Data for Name: leave_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.leave_requests (id, teacher_id, school_id, leave_type, start_date, end_date, reason, status, reviewed_at, created_at) FROM stdin;
2	90	5	Emergency Leave	2026-03-23	2026-03-23	dfgn	approved	2026-03-20 22:42:16.169683	2026-03-20 22:41:34.868999
3	108	5	Sick Leave	2026-03-23	2026-03-23	\N	approved	2026-03-22 11:55:09.030822	2026-03-22 11:54:32.243286
5	95	5	Sick Leave	2026-03-25	2026-03-25	\N	approved	2026-03-22 12:04:54.667479	2026-03-22 12:04:08.879133
6	90	5	Sick Leave	2026-03-24	2026-03-24	\N	approved	2026-03-22 12:21:16.004749	2026-03-22 12:20:48.08629
4	108	5	Sick Leave	2026-03-25	2026-03-25	\N	approved	2026-03-22 12:21:57.259751	2026-03-22 11:57:49.819767
7	99	5	Sick Leave	2026-03-27	2026-03-27	\N	approved	2026-03-22 12:36:15.030087	2026-03-22 12:34:58.86018
8	95	5	Sick Leave	2026-03-22	2026-03-22	\N	approved	2026-03-22 13:44:26.376873	2026-03-22 13:44:08.302827
33	95	5	Sick Leave	2026-03-25	2026-03-25	\N	approved	2026-03-22 15:12:54.966046	2026-03-22 15:12:40.119469
34	95	5	Sick Leave	2026-03-26	2026-03-26	\N	rejected	2026-03-22 15:25:54.018565	2026-03-22 15:16:52.745604
35	95	5	Sick Leave	2026-03-30	2026-03-30	\N	rejected	2026-03-22 15:35:31.329027	2026-03-22 15:27:05.879776
36	95	5	Sick Leave	2026-03-31	2026-03-31	\N	rejected	2026-03-22 15:35:32.144627	2026-03-22 15:28:28.295556
37	95	5	Sick Leave	2026-03-24	2026-03-24	\N	rejected	2026-03-22 15:44:18.647964	2026-03-22 15:35:47.661173
38	108	5	Sick Leave	2026-03-26	2026-03-26	\N	approved	2026-03-25 20:48:47.874349	2026-03-25 20:47:50.234623
39	108	5	Sick Leave	2026-03-31	2026-03-31	\N	pending	\N	2026-03-29 00:44:27.240227
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notifications (id, school_id, recipient_teacher_id, sender_teacher_id, type, title, message, data, is_read, created_at, recipient_school_id, recipient_student_id) FROM stdin;
204	5	90	\N	doubt_resolved	Doubt marked resolved — Mathematics	Preeti Joshi marked their doubt as resolved. Great help!	{"doubt_id": 2}	t	2026-03-27 08:28:53.659191	\N	\N
254	5	79	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 01:59:14.521006	\N	\N
3	5	90	\N	leave_approved	Leave Request Approved	Your Emergency Leave leave request (Mon Mar 23 to Mon Mar 23) has been approved.	{"status": "approved", "leave_type": "Emergency Leave", "leave_request_id": 2}	t	2026-03-20 22:42:16.173924	\N	\N
5	5	80	90	period_delay	Delay 10min — Period 3	Period 3 (Mathematics) for Gr.8-C will be delayed by 10 minutes.	{"grade": "8", "section": "C", "subject": "Mathematics", "delay_minutes": 10, "period_number": 3}	t	2026-03-20 23:07:23.73754	\N	\N
11	5	95	\N	leave_approved	Leave Request Approved	Your Sick Leave leave request (Wed Mar 25 to Wed Mar 25) has been approved.	{"status": "approved", "leave_type": "Sick Leave", "leave_request_id": 5}	t	2026-03-22 12:04:54.676633	\N	\N
274	5	94	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 21:13:34.984988	\N	\N
17	5	102	\N	substitute_assigned	Substitute Assignment — Covering for Suresh Nair	You have been assigned as substitute teacher:\n• Period 1 (Hindi) — Class 8-C on Wed Mar 25 · 08:00–08:45\n• Period 2 (Hindi) — Class 8-A on Wed Mar 25 · 08:50–09:35\n• Period 3 (Hindi) — Class 10-B on Wed Mar 25 · 09:40–10:25\n• Period 4 (Hindi) — Class 7-B on Wed Mar 25 · 10:45–11:30\n• Period 6 (Hindi) — Class 6-B on Wed Mar 25 · 12:25–13:10	{"period_count": 5, "leave_request_id": 7, "original_teacher_id": 99}	t	2026-03-22 12:36:14.345558	\N	\N
275	5	100	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 21:13:34.995891	\N	\N
14	5	102	\N	substitute_assigned	Substitute Assignment — Covering for kowsik	You have been assigned as substitute teacher:\n• Period 1 (Telugu) — Class 10-A on Mon Mar 23 · 08:00–08:45\n• Period 2 (Telugu) — Class 10-B on Mon Mar 23 · 08:50–09:35\n• Period 3 (Telugu) — Class 6-A on Mon Mar 23 · 09:40–10:25\n• Period 4 (Telugu) — Class 6-B on Mon Mar 23 · 10:45–11:30\n• Period 5 (Telugu) — Class 10-A on Mon Mar 23 · 11:35–12:20\n• Period 6 (Telugu) — Class 10-B on Mon Mar 23 · 12:25–13:10	{"period_count": 6, "leave_request_id": 4, "original_teacher_id": 108}	t	2026-03-22 12:21:57.045379	\N	\N
6	5	91	108	substitute_needed	Substitute needed — Period 1	Unable to attend Period 1 (Telugu) for Grade 7-A. Please arrange a substitute.	{"grade": "7", "section": "A", "subject": "Telugu", "delay_minutes": null, "period_number": 1}	t	2026-03-20 23:35:01.753683	\N	\N
255	5	94	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 01:59:14.528181	\N	\N
276	5	79	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 21:13:34.997401	\N	\N
277	5	98	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 21:13:34.998805	\N	\N
256	5	98	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 01:59:14.529635	\N	\N
257	5	108	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 01:59:14.530734	\N	\N
258	5	100	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 01:59:14.531929	\N	\N
259	5	91	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 01:59:14.533176	\N	\N
263	5	94	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 02:09:52.522822	\N	\N
264	5	98	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 02:09:52.524354	\N	\N
265	5	108	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 02:09:52.525572	\N	\N
266	5	100	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 02:09:52.527236	\N	\N
267	5	91	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 02:09:52.528491	\N	\N
9	5	\N	108	leave_request	Leave Request: kowsik	kowsik has requested Sick Leave leave from 2026-03-25 to 2026-03-25	{"end_date": "2026-03-25", "leave_type": "Sick Leave", "start_date": "2026-03-25", "leave_request_id": 4}	t	2026-03-22 11:57:49.827013	5	\N
2	5	\N	90	leave_request	Leave Request: Priya Sharma	Priya Sharma has requested Emergency Leave leave from 2026-03-23 to 2026-03-23: dfgn	{"end_date": "2026-03-23", "leave_type": "Emergency Leave", "start_date": "2026-03-23", "leave_request_id": 2}	t	2026-03-20 22:41:34.88459	5	\N
10	5	\N	95	leave_request	Leave Request: Ramesh Iyer	Ramesh Iyer has requested Sick Leave leave from 2026-03-25 to 2026-03-25	{"end_date": "2026-03-25", "leave_type": "Sick Leave", "start_date": "2026-03-25", "leave_request_id": 5}	t	2026-03-22 12:04:08.891093	5	\N
278	5	108	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 21:13:35.000128	\N	\N
279	5	91	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 21:13:35.001225	\N	\N
280	5	79	\N	timetable	Timetable Published	Your timetable for Grade 1-A is now ready.	\N	f	2026-03-29 21:30:18.361929	\N	\N
281	5	174	\N	timetable	Timetable Published	Your timetable for Grade 1-A is now ready.	\N	f	2026-03-29 21:30:18.36976	\N	\N
285	5	79	\N	timetable	Timetable Published	Your timetable for Grade 1-A is now ready.	\N	f	2026-03-29 21:33:25.90423	\N	\N
286	5	91	\N	timetable	Timetable Published	Your timetable for Grade 1-A is now ready.	\N	f	2026-03-29 21:33:25.914548	\N	\N
287	5	174	\N	timetable	Timetable Published	Your timetable for Grade 1-A is now ready.	\N	f	2026-03-29 21:33:25.916224	\N	\N
154	5	95	\N	leave_rejected	Leave Request Rejected	Your Sick Leave leave request (Thu Mar 26 to Thu Mar 26) has been rejected.	{"status": "rejected", "leave_type": "Sick Leave", "leave_request_id": 34}	t	2026-03-22 15:25:54.039878	\N	\N
152	5	95	\N	leave_approved	Leave Request Approved	Your Sick Leave leave request (Wed Mar 25 to Wed Mar 25) has been approved.	{"status": "approved", "leave_type": "Sick Leave", "leave_request_id": 33}	f	2026-03-22 15:12:54.976375	\N	\N
205	5	\N	\N	doubt_reply	Reply to your doubt — Mathematics	Priya Sharma replied: "hi divya"	{"doubt_id": 13}	f	2026-03-27 21:53:34.411257	\N	14
207	5	\N	\N	doubt_reply	Reply to your doubt — Mathematics	Priya Sharma replied: "edfsvd"	{"doubt_id": 11}	f	2026-03-27 21:54:53.393093	\N	14
208	5	\N	\N	doubt_reply	Reply to your doubt — Mathematics	Priya Sharma replied: "dfsv"	{"doubt_id": 10}	f	2026-03-27 21:54:59.655219	\N	14
210	5	\N	\N	doubt_reply	Reply to your doubt — Mathematics	Priya Sharma replied: "hi"	{"doubt_id": 12}	f	2026-03-27 21:56:11.558076	\N	14
212	5	\N	\N	doubt_reply	Reply to your doubt — Mathematics	Priya Sharma replied: "ok divya i will explain clearly4"	{"doubt_id": 12}	f	2026-03-27 21:56:39.667687	\N	14
213	5	\N	\N	doubt_replied	Final answer posted — Mathematics	Priya Sharma: "bm,//v"	{"doubt_id": 12}	f	2026-03-27 22:03:30.031744	\N	14
19	5	80	\N	substitute_info	Substitute arranged for Class 8-C	Suresh Nair is on approved leave. Substitutes arranged:\n• Period 1 (Hindi) → Rekha Sharma on Wed Mar 25 · 08:00–08:45\nPlease inform your students.	{"class_id": 48, "leave_request_id": 7, "original_teacher_id": 99}	f	2026-03-22 12:36:14.380245	\N	\N
20	5	94	\N	substitute_info	Substitute arranged for Class 6-B	Suresh Nair is on approved leave. Substitutes arranged:\n• Period 6 (Hindi) → Rekha Sharma on Wed Mar 25 · 12:25–13:10\nPlease inform your students.	{"class_id": 47, "leave_request_id": 7, "original_teacher_id": 99}	f	2026-03-22 12:36:14.386383	\N	\N
21	5	98	\N	substitute_info	Substitute arranged for Class 7-B	Suresh Nair is on approved leave. Substitutes arranged:\n• Period 4 (Hindi) → Rekha Sharma on Wed Mar 25 · 10:45–11:30\nPlease inform your students.	{"class_id": 61, "leave_request_id": 7, "original_teacher_id": 99}	f	2026-03-22 12:36:14.38842	\N	\N
22	5	99	\N	substitute_info	Substitute arranged for Class 10-B	Suresh Nair is on approved leave. Substitutes arranged:\n• Period 3 (Hindi) → Rekha Sharma on Wed Mar 25 · 09:40–10:25\nPlease inform your students.	{"class_id": 51, "leave_request_id": 7, "original_teacher_id": 99}	f	2026-03-22 12:36:14.390722	\N	\N
23	5	99	\N	leave_approved	Leave Request Approved	Your Sick Leave leave request (Fri Mar 27 to Fri Mar 27) has been approved.	{"status": "approved", "leave_type": "Sick Leave", "leave_request_id": 7}	f	2026-03-22 12:36:15.064977	\N	\N
25	5	103	\N	substitute_assigned	Substitute Assignment — Covering for Ramesh Iyer	You have been assigned as substitute teacher:\n• Period 1 (Social Studies) — Class 8-C on Fri Mar 20 · 08:00–08:45	{"period_count": 1, "leave_request_id": 8, "original_teacher_id": 95}	f	2026-03-22 13:44:26.017611	\N	\N
26	5	107	\N	substitute_assigned	Substitute Assignment — Covering for Ramesh Iyer	You have been assigned as substitute teacher:\n• Period 3 (Social Studies) — Class 10-B on Fri Mar 20 · 09:40–10:25	{"period_count": 1, "leave_request_id": 8, "original_teacher_id": 95}	f	2026-03-22 13:44:26.021919	\N	\N
27	5	87	\N	substitute_assigned	Substitute Assignment — Covering for Ramesh Iyer	You have been assigned as substitute teacher:\n• Period 5 (Social Studies) — Class 6-B on Fri Mar 20 · 11:35–12:20	{"period_count": 1, "leave_request_id": 8, "original_teacher_id": 95}	f	2026-03-22 13:44:26.02346	\N	\N
28	5	104	\N	substitute_assigned	Substitute Assignment — Covering for Ramesh Iyer	You have been assigned as substitute teacher:\n• Period 6 (Social Studies) — Class 7-B on Fri Mar 20 · 12:25–13:10	{"period_count": 1, "leave_request_id": 8, "original_teacher_id": 95}	f	2026-03-22 13:44:26.024842	\N	\N
29	5	80	\N	substitute_info	Substitute arranged for Class 8-C	Ramesh Iyer is on approved leave. Substitutes arranged:\n• Period 1 (Social Studies) → Nandini Bose on Fri Mar 20 · 08:00–08:45\nPlease inform your students.	{"class_id": 48, "leave_request_id": 8, "original_teacher_id": 95}	f	2026-03-22 13:44:26.027898	\N	\N
30	5	94	\N	substitute_info	Substitute arranged for Class 6-B	Ramesh Iyer is on approved leave. Substitutes arranged:\n• Period 5 (Social Studies) → Sanjay Kumar on Fri Mar 20 · 11:35–12:20\nPlease inform your students.	{"class_id": 47, "leave_request_id": 8, "original_teacher_id": 95}	f	2026-03-22 13:44:26.029358	\N	\N
31	5	98	\N	substitute_info	Substitute arranged for Class 7-B	Ramesh Iyer is on approved leave. Substitutes arranged:\n• Period 6 (Social Studies) → Dr. Arun Kumar on Fri Mar 20 · 12:25–13:10\nPlease inform your students.	{"class_id": 61, "leave_request_id": 8, "original_teacher_id": 95}	f	2026-03-22 13:44:26.031415	\N	\N
32	5	99	\N	substitute_info	Substitute arranged for Class 10-B	Ramesh Iyer is on approved leave. Substitutes arranged:\n• Period 3 (Social Studies) → Rajani Kumari on Fri Mar 20 · 09:40–10:25\nPlease inform your students.	{"class_id": 51, "leave_request_id": 8, "original_teacher_id": 95}	f	2026-03-22 13:44:26.033897	\N	\N
33	5	95	\N	leave_approved	Leave Request Approved	Your Sick Leave leave request (Sun Mar 22 to Sun Mar 22) has been approved.	{"status": "approved", "leave_type": "Sick Leave", "leave_request_id": 8}	t	2026-03-22 13:44:26.382221	\N	\N
198	5	\N	\N	doubt_reply	Reply to your doubt — Telugu	kowsik replied: "hi preeti"	{"doubt_id": 1}	t	2026-03-27 08:05:38.686478	\N	17
202	5	\N	\N	doubt_resolved	Doubt resolved — Telugu	kowsik has marked your doubt as resolved.	{"doubt_id": 1}	t	2026-03-27 08:07:59.882845	\N	17
157	5	95	\N	leave_rejected	Leave Request Rejected	Your Sick Leave leave request (2026-03-30 to 2026-03-30) has been rejected.	{"status": "rejected", "leave_type": "Sick Leave", "leave_request_id": 35}	f	2026-03-22 15:35:31.336431	\N	\N
150	5	107	\N	substitute_assigned	Substitute Assignment — Covering for Ramesh Iyer	You have been assigned as substitute teacher:\n• Period 6 (Social Studies) — Class 7-B on Mon Mar 23 · 12:25–13:10	{"period_count": 1, "leave_request_id": 33, "original_teacher_id": 95}	f	2026-03-22 15:12:54.682109	\N	\N
151	5	98	\N	substitute_info	Substitute arranged for Class 7-B	Ramesh Iyer is on approved leave. Substitutes arranged:\n• Period 6 (Social Studies) → Rajani Kumari on Mon Mar 23 · 12:25–13:10\nPlease inform your students.	{"class_id": 61, "leave_request_id": 33, "original_teacher_id": 95}	f	2026-03-22 15:12:54.695005	\N	\N
158	5	95	\N	leave_rejected	Leave Request Rejected	Your Sick Leave leave request (2026-03-31 to 2026-03-31) has been rejected.	{"status": "rejected", "leave_type": "Sick Leave", "leave_request_id": 36}	f	2026-03-22 15:35:32.146086	\N	\N
160	5	95	\N	leave_rejected	Leave Request Rejected	Your Sick Leave leave request (2026-03-24 to 2026-03-24) has been rejected.	{"status": "rejected", "leave_type": "Sick Leave", "leave_request_id": 37}	f	2026-03-22 15:44:18.659025	\N	\N
162	5	102	\N	substitute_assigned	Emergency Cover — Priya Sharma is absent	You have been assigned as substitute teacher:\n• Period 3 (Mathematics) — Class 7-B on 2026-03-24 · 09:40–10:25	{"emergency": true, "period_count": 1, "leave_request_id": null, "original_teacher_id": 90}	f	2026-03-22 19:27:53.686652	\N	\N
163	5	98	\N	substitute_assigned	Emergency Cover — Priya Sharma is absent	You have been assigned as substitute teacher:\n• Period 6 (Mathematics) — Class 6-B on 2026-03-24 · 12:25–13:10	{"emergency": true, "period_count": 1, "leave_request_id": null, "original_teacher_id": 90}	f	2026-03-22 19:27:53.689629	\N	\N
164	5	94	\N	substitute_info	Substitute arranged for Class 6-B	Priya Sharma is absent today. Emergency substitutes arranged:\n• Period 6 (Mathematics) → Kavita Patel on 2026-03-24 · 12:25–13:10\nPlease inform your students.	{"class_id": 47, "emergency": true, "leave_request_id": null, "original_teacher_id": 90}	f	2026-03-22 19:27:53.694049	\N	\N
165	5	98	\N	substitute_info	Substitute arranged for Class 7-B	Priya Sharma is absent today. Emergency substitutes arranged:\n• Period 3 (Mathematics) → Rekha Sharma on 2026-03-24 · 09:40–10:25\nPlease inform your students.	{"class_id": 61, "emergency": true, "leave_request_id": null, "original_teacher_id": 90}	f	2026-03-22 19:27:53.695949	\N	\N
166	5	99	\N	substitute_info	Substitute arranged for Class 10-B	Priya Sharma is absent today. Emergency substitutes arranged:\n• Period 2 (Mathematics) → Meena Rao on 2026-03-24 · 08:50–09:35\nPlease inform your students.	{"class_id": 51, "emergency": true, "leave_request_id": null, "original_teacher_id": 90}	f	2026-03-22 19:27:53.698434	\N	\N
200	5	\N	\N	doubt_reply	Reply to your doubt — Telugu	kowsik replied: "ok i will clairfy in  school"	{"doubt_id": 1}	t	2026-03-27 08:06:36.734594	\N	17
203	5	\N	\N	doubt_reply	Reply to your doubt — Mathematics	Priya Sharma replied: "hi"	{"doubt_id": 2}	t	2026-03-27 08:09:26.746449	\N	17
161	5	88	\N	substitute_assigned	Emergency Cover — Priya Sharma is absent	You have been assigned as substitute teacher:\n• Period 2 (Mathematics) — Class 10-B on 2026-03-24 · 08:50–09:35	{"emergency": true, "period_count": 1, "leave_request_id": null, "original_teacher_id": 90}	t	2026-03-22 19:27:53.678856	\N	\N
167	5	88	\N	substitute_assigned	Emergency Cover — Priya Sharma is absent	You have been assigned as substitute teacher:\n• Period 2 (Mathematics) — Class 10-B on 2026-03-24 · 08:50–09:35	{"emergency": true, "period_count": 1, "leave_request_id": null, "original_teacher_id": 90}	f	2026-03-22 19:29:34.486178	\N	\N
169	5	98	\N	substitute_assigned	Emergency Cover — Priya Sharma is absent	You have been assigned as substitute teacher:\n• Period 6 (Mathematics) — Class 6-B on 2026-03-24 · 12:25–13:10	{"emergency": true, "period_count": 1, "leave_request_id": null, "original_teacher_id": 90}	f	2026-03-22 19:29:34.494206	\N	\N
170	5	94	\N	substitute_info	Substitute arranged for Class 6-B	Priya Sharma is absent today. Emergency substitutes arranged:\n• Period 6 (Mathematics) → Kavita Patel on 2026-03-24 · 12:25–13:10\nPlease inform your students.	{"class_id": 47, "emergency": true, "leave_request_id": null, "original_teacher_id": 90}	f	2026-03-22 19:29:34.498099	\N	\N
171	5	98	\N	substitute_info	Substitute arranged for Class 7-B	Priya Sharma is absent today. Emergency substitutes arranged:\n• Period 3 (Mathematics) → Sunita Rao on 2026-03-24 · 09:40–10:25\nPlease inform your students.	{"class_id": 61, "emergency": true, "leave_request_id": null, "original_teacher_id": 90}	f	2026-03-22 19:29:34.499515	\N	\N
172	5	99	\N	substitute_info	Substitute arranged for Class 10-B	Priya Sharma is absent today. Emergency substitutes arranged:\n• Period 2 (Mathematics) → Meena Rao on 2026-03-24 · 08:50–09:35\nPlease inform your students.	{"class_id": 51, "emergency": true, "leave_request_id": null, "original_teacher_id": 90}	f	2026-03-22 19:29:34.500899	\N	\N
168	5	92	\N	substitute_assigned	Emergency Cover — Priya Sharma is absent	You have been assigned as substitute teacher:\n• Period 3 (Mathematics) — Class 7-B on 2026-03-24 · 09:40–10:25	{"emergency": true, "period_count": 1, "leave_request_id": null, "original_teacher_id": 90}	t	2026-03-22 19:29:34.49235	\N	\N
173	5	174	\N	substitute_assigned	Emergency Cover — Amit Verma is absent	You have been assigned as substitute teacher:\n• Period 3 (Mathematics) — Class 7-B on 2026-03-25 · 09:40–10:25\n• Period 4 (Mathematics) — Class 10-A on 2026-03-25 · 10:45–11:30\n• Period 5 (Mathematics) — Class 7-A on 2026-03-25 · 11:35–12:20\n• Period 6 (Mathematics) — Class 8-B on 2026-03-25 · 12:25–13:10	{"emergency": true, "period_count": 4, "leave_request_id": null, "original_teacher_id": 91}	f	2026-03-22 19:33:33.387571	\N	\N
174	5	91	\N	substitute_info	Substitute arranged for Class 7-A	Amit Verma is absent today. Emergency substitutes arranged:\n• Period 5 (Mathematics) → Sumanth on 2026-03-25 · 11:35–12:20\nPlease inform your students.	{"class_id": 49, "emergency": true, "leave_request_id": null, "original_teacher_id": 91}	f	2026-03-22 19:33:33.394297	\N	\N
175	5	92	\N	substitute_info	Substitute arranged for Class 8-B	Amit Verma is absent today. Emergency substitutes arranged:\n• Period 6 (Mathematics) → Sumanth on 2026-03-25 · 12:25–13:10\nPlease inform your students.	{"class_id": 55, "emergency": true, "leave_request_id": null, "original_teacher_id": 91}	f	2026-03-22 19:33:33.396367	\N	\N
176	5	95	\N	substitute_info	Substitute arranged for Class 10-A	Amit Verma is absent today. Emergency substitutes arranged:\n• Period 4 (Mathematics) → Sumanth on 2026-03-25 · 10:45–11:30\nPlease inform your students.	{"class_id": 45, "emergency": true, "leave_request_id": null, "original_teacher_id": 91}	f	2026-03-22 19:33:33.398575	\N	\N
209	5	\N	\N	doubt_reply	Reply to your doubt — Mathematics	Priya Sharma replied: "defv"	{"doubt_id": 5}	t	2026-03-27 21:55:06.147405	\N	17
4	5	90	90	period_delay	Delay 10min — Period 3	Period 3 (Mathematics) for Gr.8-A will be delayed by 10 minutes.	{"grade": "8", "section": "A", "subject": "Mathematics", "delay_minutes": 10, "period_number": 3}	t	2026-03-20 23:07:07.684704	\N	\N
13	5	90	\N	leave_approved	Leave Request Approved	Your Sick Leave leave request (Tue Mar 24 to Tue Mar 24) has been approved.	{"status": "approved", "leave_type": "Sick Leave", "leave_request_id": 6}	t	2026-03-22 12:21:16.01489	\N	\N
211	5	90	\N	doubt_reply	Student follow-up — Mathematics	Divya Rao replied: "hi man havign doubt regaridng theorem"	{"doubt_id": 12}	t	2026-03-27 21:56:28.944212	\N	\N
214	5	90	\N	doubt_reply	Student follow-up — Mathematics	Divya Rao: "ftyuiop[7\\789"	{"doubt_id": 12}	t	2026-03-27 22:03:54.116302	\N	\N
206	5	\N	\N	doubt_reply	Reply to your doubt — Mathematics	Priya Sharma replied: "what dobut"	{"doubt_id": 13}	f	2026-03-27 21:53:58.084083	\N	14
177	5	98	\N	substitute_info	Substitute arranged for Class 7-B	Amit Verma is absent today. Emergency substitutes arranged:\n• Period 3 (Mathematics) → Sumanth on 2026-03-25 · 09:40–10:25\nPlease inform your students.	{"class_id": 61, "emergency": true, "leave_request_id": null, "original_teacher_id": 91}	f	2026-03-22 19:33:33.400103	\N	\N
179	5	174	\N	substitute_assigned	Substitute Assignment — Covering for kowsik	You have been assigned as substitute teacher:\n• Period 1 (Telugu) — Class 7-A on 2026-03-26 · 08:00–08:45	{"emergency": false, "period_count": 1, "leave_request_id": 38, "original_teacher_id": 108}	f	2026-03-25 20:48:46.802539	\N	\N
180	5	102	\N	substitute_assigned	Substitute Assignment — Covering for kowsik	You have been assigned as substitute teacher:\n• Period 2 (Telugu) — Class 7-B on 2026-03-26 · 08:50–09:35	{"emergency": false, "period_count": 1, "leave_request_id": 38, "original_teacher_id": 108}	f	2026-03-25 20:48:46.805271	\N	\N
181	5	93	\N	substitute_assigned	Substitute Assignment — Covering for kowsik	You have been assigned as substitute teacher:\n• Period 3 (Telugu) — Class 10-A on 2026-03-26 · 09:40–10:25\n• Period 4 (Telugu) — Class 10-B on 2026-03-26 · 10:45–11:30\n• Period 5 (Telugu) — Class 6-A on 2026-03-26 · 11:35–12:20	{"emergency": false, "period_count": 3, "leave_request_id": 38, "original_teacher_id": 108}	f	2026-03-25 20:48:46.80658	\N	\N
182	5	99	\N	substitute_assigned	Substitute Assignment — Covering for kowsik	You have been assigned as substitute teacher:\n• Period 6 (Telugu) — Class 6-B on 2026-03-26 · 12:25–13:10	{"emergency": false, "period_count": 1, "leave_request_id": 38, "original_teacher_id": 108}	f	2026-03-25 20:48:46.807807	\N	\N
183	5	91	\N	substitute_info	Substitute arranged for Class 7-A	kowsik is on approved leave. Substitutes arranged:\n• Period 1 (Telugu) → Sumanth on 2026-03-26 · 08:00–08:45\nPlease inform your students.	{"class_id": 49, "emergency": false, "leave_request_id": 38, "original_teacher_id": 108}	f	2026-03-25 20:48:46.811537	\N	\N
184	5	94	\N	substitute_info	Substitute arranged for Class 6-B	kowsik is on approved leave. Substitutes arranged:\n• Period 6 (Telugu) → Suresh Nair on 2026-03-26 · 12:25–13:10\nPlease inform your students.	{"class_id": 47, "emergency": false, "leave_request_id": 38, "original_teacher_id": 108}	f	2026-03-25 20:48:46.81311	\N	\N
185	5	95	\N	substitute_info	Substitute arranged for Class 10-A	kowsik is on approved leave. Substitutes arranged:\n• Period 3 (Telugu) → Rahul Gupta on 2026-03-26 · 09:40–10:25\nPlease inform your students.	{"class_id": 45, "emergency": false, "leave_request_id": 38, "original_teacher_id": 108}	f	2026-03-25 20:48:46.814673	\N	\N
186	5	96	\N	substitute_info	Substitute arranged for Class 6-A	kowsik is on approved leave. Substitutes arranged:\n• Period 5 (Telugu) → Rahul Gupta on 2026-03-26 · 11:35–12:20\nPlease inform your students.	{"class_id": 59, "emergency": false, "leave_request_id": 38, "original_teacher_id": 108}	f	2026-03-25 20:48:46.816428	\N	\N
187	5	98	\N	substitute_info	Substitute arranged for Class 7-B	kowsik is on approved leave. Substitutes arranged:\n• Period 2 (Telugu) → Rekha Sharma on 2026-03-26 · 08:50–09:35\nPlease inform your students.	{"class_id": 61, "emergency": false, "leave_request_id": 38, "original_teacher_id": 108}	f	2026-03-25 20:48:46.81809	\N	\N
188	5	99	\N	substitute_info	Substitute arranged for Class 10-B	kowsik is on approved leave. Substitutes arranged:\n• Period 4 (Telugu) → Rahul Gupta on 2026-03-26 · 10:45–11:30\nPlease inform your students.	{"class_id": 51, "emergency": false, "leave_request_id": 38, "original_teacher_id": 108}	f	2026-03-25 20:48:46.819718	\N	\N
227	5	79	108	marks_entry_required	Enter marks — unit test 1	Please enter English marks for Unit Test (Grade )	{"exam_id": 1, "class_id": 43, "subject_name": "English"}	t	2026-03-28 21:15:59.662086	\N	\N
237	5	95	108	marks_entry_required	Enter marks — fd	Please enter Social Studies marks for Mid Term (Grade )	{"exam_id": 2, "class_id": 43, "subject_name": "Social Studies"}	f	2026-03-28 22:10:52.185253	\N	\N
238	5	96	108	marks_entry_required	Enter marks — fd	Please enter English marks for Mid Term (Grade )	{"exam_id": 2, "class_id": 43, "subject_name": "English"}	f	2026-03-28 22:10:52.186822	\N	\N
239	5	99	108	marks_entry_required	Enter marks — fd	Please enter Hindi marks for Mid Term (Grade )	{"exam_id": 2, "class_id": 43, "subject_name": "Hindi"}	f	2026-03-28 22:10:52.18816	\N	\N
236	5	90	108	marks_entry_required	Enter marks — fd	Please enter Mathematics marks for Mid Term (Grade )	{"exam_id": 2, "class_id": 43, "subject_name": "Mathematics"}	t	2026-03-28 22:10:52.176397	\N	\N
234	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-28 22:01:19.037245	\N	\N
230	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-28 21:35:05.853402	\N	\N
228	5	91	108	marks_entry_required	Enter marks — unit test 1	Please enter Mathematics marks for Unit Test (Grade )	{"exam_id": 1, "class_id": 43, "subject_name": "Mathematics"}	t	2026-03-28 21:15:59.666628	\N	\N
218	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-28 14:46:21.345329	\N	\N
189	5	108	\N	leave_approved	Leave Request Approved	Your Sick Leave leave request (2026-03-26 to 2026-03-26) has been approved.	{"status": "approved", "leave_type": "Sick Leave", "leave_request_id": 38}	t	2026-03-25 20:48:47.879097	\N	\N
221	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-28 14:47:15.78948	\N	\N
260	5	108	\N	timetable	Timetable Updated	Telugu teacher has been updated for Grade 8-A.	\N	f	2026-03-29 02:01:08.302069	\N	\N
268	5	79	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 02:14:19.333522	\N	\N
269	5	94	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 02:14:19.337217	\N	\N
270	5	98	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 02:14:19.338189	\N	\N
271	5	108	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 02:14:19.33948	\N	\N
272	5	100	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 02:14:19.340271	\N	\N
231	5	\N	\N	doubt_replied	Reply to your doubt — Mathematics	Priya Sharma: "hi"	{"doubt_id": 14}	f	2026-03-28 21:55:48.070387	\N	17
232	5	\N	\N	doubt_replied	Reply to your doubt — Mathematics	Priya Sharma: "what is the issue"	{"doubt_id": 14}	f	2026-03-28 21:55:56.217708	\N	17
224	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-28 20:59:13.093261	\N	\N
18	5	108	\N	substitute_info	Substitute arranged for Class 8-A	Suresh Nair is on approved leave. Substitutes arranged:\n• Period 2 (Hindi) → Rekha Sharma on Wed Mar 25 · 08:50–09:35\nPlease inform your students.	{"class_id": 43, "leave_request_id": 7, "original_teacher_id": 99}	t	2026-03-22 12:36:14.378177	\N	\N
8	5	108	\N	leave_approved	Leave Request Approved	Your Sick Leave leave request (Mon Mar 23 to Mon Mar 23) has been approved.	{"status": "approved", "leave_type": "Sick Leave", "leave_request_id": 3}	t	2026-03-22 11:55:09.042753	\N	\N
192	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-25 21:07:32.563513	\N	\N
194	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-25 22:33:55.158707	\N	\N
197	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-26 22:03:40.855785	\N	\N
191	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-25 20:51:54.18216	\N	\N
193	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-25 21:14:05.27235	\N	\N
240	5	108	90	marks_submitted	Mathematics marks submitted — fd	Priya Sharma has submitted Mathematics marks.	{"exam_id": 2}	f	2026-03-28 22:19:10.344932	\N	\N
242	5	94	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 01:48:39.557917	\N	\N
243	5	100	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 01:48:39.566826	\N	\N
244	5	79	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 01:48:39.56808	\N	\N
245	5	98	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 01:48:39.56936	\N	\N
246	5	108	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 01:48:39.570517	\N	\N
247	5	91	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 01:48:39.571554	\N	\N
261	5	174	\N	timetable	Timetable Updated	Telugu teacher has been updated for Grade 6-A.	\N	f	2026-03-29 02:05:17.461377	\N	\N
273	5	91	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 02:14:19.341583	\N	\N
12	5	\N	90	leave_request	Leave Request: Priya Sharma	Priya Sharma has requested Sick Leave leave from 2026-03-24 to 2026-03-24	{"end_date": "2026-03-24", "leave_type": "Sick Leave", "start_date": "2026-03-24", "leave_request_id": 6}	t	2026-03-22 12:20:48.106135	5	\N
241	5	\N	108	leave_request	Leave Request: kowsik	kowsik has requested Sick Leave leave from 2026-03-31 to 2026-03-31	{"end_date": "2026-03-31", "leave_type": "Sick Leave", "start_date": "2026-03-31", "leave_request_id": 39}	t	2026-03-29 00:44:27.253823	5	\N
7	5	\N	108	leave_request	Leave Request: kowsik	kowsik has requested Sick Leave leave from 2026-03-23 to 2026-03-23	{"end_date": "2026-03-23", "leave_type": "Sick Leave", "start_date": "2026-03-23", "leave_request_id": 3}	t	2026-03-22 11:54:32.259026	5	\N
16	5	\N	99	leave_request	Leave Request: Suresh Nair	Suresh Nair has requested Sick Leave leave from 2026-03-27 to 2026-03-27	{"end_date": "2026-03-27", "leave_type": "Sick Leave", "start_date": "2026-03-27", "leave_request_id": 7}	t	2026-03-22 12:34:58.895105	5	\N
156	5	\N	95	leave_request	Leave Request: Ramesh Iyer	Ramesh Iyer has requested Sick Leave leave from 2026-03-31 to 2026-03-31	{"end_date": "2026-03-31", "leave_type": "Sick Leave", "start_date": "2026-03-31", "leave_request_id": 36}	t	2026-03-22 15:28:28.30673	5	\N
159	5	\N	95	leave_request	Leave Request: Ramesh Iyer	Ramesh Iyer has requested Sick Leave leave from 2026-03-24 to 2026-03-24	{"end_date": "2026-03-24", "leave_type": "Sick Leave", "start_date": "2026-03-24", "leave_request_id": 37}	t	2026-03-22 15:35:47.672926	5	\N
24	5	\N	95	leave_request	Leave Request: Ramesh Iyer	Ramesh Iyer has requested Sick Leave leave from 2026-03-22 to 2026-03-22	{"end_date": "2026-03-22", "leave_type": "Sick Leave", "start_date": "2026-03-22", "leave_request_id": 8}	t	2026-03-22 13:44:08.321246	5	\N
153	5	\N	95	leave_request	Leave Request: Ramesh Iyer	Ramesh Iyer has requested Sick Leave leave from 2026-03-26 to 2026-03-26	{"end_date": "2026-03-26", "leave_type": "Sick Leave", "start_date": "2026-03-26", "leave_request_id": 34}	t	2026-03-22 15:16:52.783369	5	\N
215	5	\N	\N	doubt_replied	Final answer posted — Mathematics	Priya Sharma: "ftyuiop[7\\789"	{"doubt_id": 12}	f	2026-03-27 22:04:47.774776	\N	14
216	5	90	\N	doubt_resolved	Doubt marked resolved — Mathematics	Divya Rao marked their doubt as resolved. Great help!	{"doubt_id": 12}	t	2026-03-27 22:05:03.152944	\N	\N
233	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-28 21:56:51.566295	\N	\N
195	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-25 22:50:00.445143	\N	\N
196	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-26 21:19:48.16258	\N	\N
219	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-28 14:46:33.379027	\N	\N
222	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-28 15:26:46.215234	\N	\N
225	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-28 21:13:29.606139	\N	\N
235	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	f	2026-03-28 22:05:46.753679	\N	\N
229	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-28 21:16:12.162514	\N	\N
190	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-25 20:51:26.518802	\N	\N
15	5	108	\N	leave_approved	Leave Request Approved	Your Sick Leave leave request (Wed Mar 25 to Wed Mar 25) has been approved.	{"status": "approved", "leave_type": "Sick Leave", "leave_request_id": 4}	t	2026-03-22 12:21:57.265886	\N	\N
199	5	108	\N	doubt_reply	Student follow-up — Telugu	Preeti Joshi replied: "yes sir i have a doubt regading this"	{"doubt_id": 1}	t	2026-03-27 08:06:22.790716	\N	\N
201	5	108	\N	doubt_reply	Student follow-up — Telugu	Preeti Joshi replied: "ok thnkas mam"	{"doubt_id": 1}	t	2026-03-27 08:06:42.440782	\N	\N
217	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-28 12:33:05.95068	\N	\N
220	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-28 14:46:48.628955	\N	\N
223	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-28 20:53:25.19637	\N	\N
226	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:00 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	t	2026-03-28 21:15:21.275743	\N	\N
248	5	79	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 01:58:43.140448	\N	\N
249	5	94	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 01:58:43.146695	\N	\N
250	5	98	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 01:58:43.148199	\N	\N
251	5	108	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 01:58:43.149411	\N	\N
252	5	100	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 01:58:43.150684	\N	\N
253	5	91	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 01:58:43.151845	\N	\N
262	5	79	\N	timetable	Timetable Published	Your timetable for Grade 10-A is now ready.	\N	f	2026-03-29 02:09:52.508902	\N	\N
155	5	\N	95	leave_request	Leave Request: Ramesh Iyer	Ramesh Iyer has requested Sick Leave leave from 2026-03-30 to 2026-03-30	{"end_date": "2026-03-30", "leave_type": "Sick Leave", "start_date": "2026-03-30", "leave_request_id": 35}	t	2026-03-22 15:27:05.891843	5	\N
149	5	\N	95	leave_request	Leave Request: Ramesh Iyer	Ramesh Iyer has requested Sick Leave leave from 2026-03-25 to 2026-03-25	{"end_date": "2026-03-25", "leave_type": "Sick Leave", "start_date": "2026-03-25", "leave_request_id": 33}	t	2026-03-22 15:12:40.144931	5	\N
178	5	\N	108	leave_request	Leave Request: kowsik	kowsik has requested Sick Leave leave from 2026-03-26 to 2026-03-26	{"end_date": "2026-03-26", "leave_type": "Sick Leave", "start_date": "2026-03-26", "leave_request_id": 38}	t	2026-03-25 20:47:51.771098	5	\N
282	5	79	\N	timetable	Timetable Updated	Period slots have been swapped in your timetable for Grade 1-A.	\N	f	2026-03-29 21:31:37.263664	\N	\N
283	5	174	\N	timetable	Timetable Updated	Period slots have been swapped in your timetable for Grade 1-A.	\N	f	2026-03-29 21:31:46.802369	\N	\N
284	5	79	\N	timetable	Timetable Updated	Period slots have been swapped in your timetable for Grade 1-A.	\N	f	2026-03-29 21:31:54.178099	\N	\N
288	5	94	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:41.512082	\N	\N
289	5	79	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:41.523695	\N	\N
290	5	86	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:41.525812	\N	\N
291	5	98	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:41.527588	\N	\N
292	5	108	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:41.529537	\N	\N
293	5	91	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:41.531117	\N	\N
294	5	94	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:43.489187	\N	\N
295	5	79	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:43.496345	\N	\N
296	5	86	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:43.497612	\N	\N
297	5	98	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:43.499206	\N	\N
298	5	108	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:43.502209	\N	\N
299	5	91	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:43.504214	\N	\N
300	5	94	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:44.666915	\N	\N
301	5	79	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:44.67534	\N	\N
302	5	86	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:44.677107	\N	\N
303	5	98	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:44.67882	\N	\N
304	5	108	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:44.680355	\N	\N
305	5	91	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:44.682173	\N	\N
306	5	94	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:45.685454	\N	\N
307	5	79	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:45.693184	\N	\N
308	5	86	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:45.694762	\N	\N
309	5	98	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:45.696175	\N	\N
310	5	108	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:45.697715	\N	\N
311	5	91	\N	timetable	Timetable Published	Your timetable for Grade 8-A is now ready.	\N	f	2026-03-29 21:33:45.700643	\N	\N
312	5	79	\N	timetable	Timetable Published	Your timetable for Grade 2-A is now ready.	\N	f	2026-03-31 19:39:10.474144	\N	\N
313	5	91	\N	timetable	Timetable Published	Your timetable for Grade 2-A is now ready.	\N	f	2026-03-31 19:39:10.484753	\N	\N
314	5	98	\N	timetable	Timetable Published	Your timetable for Grade 2-A is now ready.	\N	f	2026-03-31 19:39:10.486474	\N	\N
315	5	100	\N	timetable	Timetable Published	Your timetable for Grade 2-A is now ready.	\N	f	2026-03-31 19:39:10.487811	\N	\N
316	5	102	\N	timetable	Timetable Published	Your timetable for Grade 2-A is now ready.	\N	f	2026-03-31 19:39:10.489285	\N	\N
317	5	174	\N	timetable	Timetable Published	Your timetable for Grade 2-A is now ready.	\N	f	2026-03-31 19:39:10.490673	\N	\N
318	5	108	\N	attendance_reminder	Attendance Not Marked	1st period of Class 8-A started at 08:30 — attendance not yet marked.	{"grade": "8", "period": 1, "section": "A", "class_id": 43}	f	2026-03-31 20:03:33.569141	\N	\N
\.


--
-- Data for Name: parent_mark_acks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.parent_mark_acks (id, exam_id, student_id, school_id, parent_name, parent_phone, acknowledged_at) FROM stdin;
\.


--
-- Data for Name: parents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.parents (id, school_id, name, email, phone, created_at) FROM stdin;
1	5	Rajesh Sharma	rajesh1@mail.com	9000000001	2026-03-20 15:12:33.03868
2	5	Suresh Reddy	suresh2@mail.com	9000000002	2026-03-20 15:12:33.03868
3	5	Ramesh Patel	ramesh3@mail.com	9000000003	2026-03-20 15:12:33.03868
4	5	Anil Kumar	anil4@mail.com	9000000004	2026-03-20 15:12:33.03868
5	5	Sunil Singh	sunil5@mail.com	9000000005	2026-03-20 15:12:33.03868
6	5	Mohan Teja	mohan6@mail.com	9000000006	2026-03-20 15:12:33.03868
7	5	Ajay Verma	ajay7@mail.com	9000000007	2026-03-20 15:12:33.03868
8	5	Ravi Reddy	ravi8@mail.com	9000000008	2026-03-20 15:12:33.03868
9	5	Venkat V	venkat9@mail.com	9000000009	2026-03-20 15:12:33.03868
10	5	Deepak Jain	deepak10@mail.com	9000000010	2026-03-20 15:12:33.03868
11	5	Sridhar Iyer	sridhar11@mail.com	9000000011	2026-03-20 15:12:33.03868
12	5	Manoj Mehta	manoj12@mail.com	9000000012	2026-03-20 15:12:33.03868
13	5	Suresh Nair	suresh13@mail.com	9000000013	2026-03-20 15:12:33.03868
14	5	Krishna Rao	krishna14@mail.com	9000000014	2026-03-20 15:12:33.03868
15	5	Srinivas S	srinivas15@mail.com	9000000015	2026-03-20 15:12:33.03868
16	5	Anil Kapoor	anil16@mail.com	9000000016	2026-03-20 15:12:33.03868
17	5	Sunil Joshi	sunil17@mail.com	9000000017	2026-03-20 15:12:33.03868
18	5	Murali M	murali18@mail.com	9000000018	2026-03-20 15:12:33.03868
19	5	Satish S	satish19@mail.com	9000000019	2026-03-20 15:12:33.03868
20	5	Prasad P	prasad20@mail.com	9000000020	2026-03-20 15:12:33.03868
21	5	Suresh Kumar	suresh21@mail.com	9000000021	2026-03-20 15:12:33.03868
22	5	Rajesh Singh	rajesh22@mail.com	9000000022	2026-03-20 15:12:33.03868
23	5	Amit Das	amit23@mail.com	9000000023	2026-03-20 15:12:33.03868
24	5	Balaji B	balaji24@mail.com	9000000024	2026-03-20 15:12:33.03868
25	5	Shiv Prakash	shiv25@mail.com	9000000025	2026-03-20 15:12:33.03868
26	5	Akbar Ali	akbar26@mail.com	9000000026	2026-03-20 15:12:33.03868
27	5	Lokesh L	lokesh27@mail.com	9000000027	2026-03-20 15:12:33.03868
28	5	Kishore K	kishore28@mail.com	9000000028	2026-03-20 15:12:33.03868
29	5	Prakash P	prakash29@mail.com	9000000029	2026-03-20 15:12:33.03868
30	5	Ankit Agarwal	ankit30@mail.com	9000000030	2026-03-20 15:12:33.03868
31	5	Ramesh Patel	ramesh31@mail.com	9000000031	2026-03-20 15:12:33.03868
32	5	Mohan Teja	mohan32@mail.com	9000000032	2026-03-20 15:12:33.03868
33	5	Rajesh R	rajesh33@mail.com	9000000033	2026-03-20 15:12:33.03868
34	5	Rakesh Yadav	rakesh34@mail.com	9000000034	2026-03-20 15:12:33.03868
35	5	Imran Khan	imran35@mail.com	9000000035	2026-03-20 15:12:33.03868
36	5	Teja T	teja36@mail.com	9000000036	2026-03-20 15:12:33.03868
37	5	Ravi Reddy	ravi37@mail.com	9000000037	2026-03-20 15:12:33.03868
38	5	Sanjay Gupta	sanjay38@mail.com	9000000038	2026-03-20 15:12:33.03868
39	5	Anil Verma	anil39@mail.com	9000000039	2026-03-20 15:12:33.03868
40	5	Paresh Patel	paresh40@mail.com	9000000040	2026-03-20 15:12:33.03868
41	5	Rajesh Sharma	rajesh41@mail.com	9000000041	2026-03-20 15:12:33.03868
42	5	Suresh Reddy	suresh42@mail.com	9000000042	2026-03-20 15:12:33.03868
43	5	Rajesh Singh	rajesh43@mail.com	9000000043	2026-03-20 15:12:33.03868
44	5	Suresh Kumar	suresh44@mail.com	9000000044	2026-03-20 15:12:33.03868
45	5	Suresh Nair	suresh45@mail.com	9000000045	2026-03-20 15:12:33.03868
46	5	Deepak Jain	deepak46@mail.com	9000000046	2026-03-20 15:12:33.03868
47	5	Anil Patil	anil47@mail.com	9000000047	2026-03-20 15:12:33.03868
48	5	Krishna Rao	krishna48@mail.com	9000000048	2026-03-20 15:12:33.03868
49	5	Sanjay Gupta	sanjay49@mail.com	9000000049	2026-03-20 15:12:33.03868
50	5	Amit Das	amit50@mail.com	9000000050	2026-03-20 15:12:33.03868
\.


--
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.password_reset_tokens (id, user_id, token, expires_at, used, created_at) FROM stdin;
\.


--
-- Data for Name: school_schedule_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.school_schedule_settings (id, school_id, periods_per_day, start_time, end_time, morning_break_after_period, morning_break_duration, lunch_after_period, lunch_duration, afternoon_break_after_period, afternoon_break_duration, updated_at) FROM stdin;
\.


--
-- Data for Name: school_subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.school_subscriptions (id, school_id, tier, updated_at) FROM stdin;
7	5	basic	2026-03-20 15:03:32.11651
8	7	basic	2026-03-21 22:58:49.939765
14	15	basic	2026-03-22 14:51:55.598503
18	22	basic	2026-03-25 20:45:48.396727
\.


--
-- Data for Name: schools; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.schools (id, name, type, city, country, status, created_at, phone, email, address, school_code, plan_start_date, plan_end_date, plan_amount) FROM stdin;
5	dsc	Private	kds	india	active	2026-03-20 15:00:32.60968	\N	\N	\N	\N	\N	\N	\N
7	testschool1	Public	kavali	india	active	2026-03-21 22:44:34.287252	9542114824	sumanthchandrano2217@gmail.com	kavali 	wlyl-schl-testschool1-7	2026-03-21	2027-03-21	\N
22	test	Private	kavli	india	active	2026-03-25 20:45:18.039471	1234567890	a@gmail.com	rthjj	wlyl-schl-test-22	2026-03-25	2027-03-25	\N
15	__TMPTEST3__	CBSE	X	India	active	2026-03-22 14:49:27.32696	\N	\N	\N	\N	2026-03-22	2027-03-22	\N
\.


--
-- Data for Name: student_badges; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.student_badges (id, student_id, school_id, badge_type, earned_at) FROM stdin;
\.


--
-- Data for Name: student_newspaper_reads; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.student_newspaper_reads (id, student_id, newspaper_id, school_id, completed_at, points_awarded) FROM stdin;
1	17	1	5	2026-03-28 14:26:13.318465+05:30	3
2	9	1	5	2026-03-28 14:42:41.949953+05:30	3
3	17	2	5	2026-03-31 20:08:28.531237+05:30	0
\.


--
-- Data for Name: student_parents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.student_parents (id, student_id, parent_id) FROM stdin;
1	1	1
2	2	2
3	3	3
4	4	4
5	5	5
6	6	6
7	7	7
8	8	8
9	9	9
10	10	10
11	11	11
12	12	12
13	13	13
14	14	14
15	15	15
16	16	16
17	17	17
18	18	18
19	19	19
20	20	20
21	21	21
22	22	22
23	23	23
24	24	24
25	25	25
26	26	26
27	27	27
28	28	28
29	29	29
30	30	30
31	31	31
32	32	32
33	33	33
34	34	34
35	35	35
36	36	36
37	37	37
38	38	38
39	39	39
40	40	40
41	41	41
42	42	42
43	43	43
44	44	44
45	45	45
46	46	46
47	47	47
48	48	48
49	49	49
50	50	50
\.


--
-- Data for Name: student_points; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.student_points (id, student_id, school_id, action_type, points, reference_id, reference_type, earned_at) FROM stdin;
1	17	5	newspaper_read	3	1	newspaper	2026-03-28 14:26:13.308141+05:30
2	9	5	newspaper_read	1	1	newspaper	2026-03-28 14:42:41.935872+05:30
3	9	5	newspaper_quiz_correct	2	1	newspaper	2026-03-28 14:42:41.949273+05:30
4	17	5	newspaper_read	1	2	newspaper	2026-03-31 20:08:28.506999+05:30
5	17	5	newspaper_quiz_wrong	-1	2	newspaper	2026-03-31 20:08:28.529557+05:30
\.


--
-- Data for Name: student_streaks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.student_streaks (student_id, school_id, current_streak, longest_streak, last_activity_date) FROM stdin;
9	5	1	1	2026-03-28
17	5	1	1	2026-03-31
\.


--
-- Data for Name: students; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.students (id, school_id, name, email, grade, section, phone, status, created_at, roll_number, parent_name, parent_phone, parent_email, password_hash, password_changed) FROM stdin;
1	5	Aarav Sharma	aarav1@student.com	7	A	8000000001	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-76678	Rajesh Sharma	9000000001	rajesh1@mail.com	\N	f
2	5	Vivaan Reddy	vivaan2@student.com	7	B	8000000002	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-44869	Suresh Reddy	9000000002	suresh2@mail.com	\N	f
3	5	Aditya Patel	aditya3@student.com	7	C	8000000003	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-86020	Ramesh Patel	9000000003	ramesh3@mail.com	\N	f
4	5	Krishna Kumar	krishna4@student.com	7	A	8000000004	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-60252	Anil Kumar	9000000004	anil4@mail.com	\N	f
5	5	Arjun Singh	arjun5@student.com	7	B	8000000005	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-31149	Sunil Singh	9000000005	sunil5@mail.com	\N	f
6	5	Sai Teja	sai6@student.com	7	C	8000000006	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-44692	Mohan Teja	9000000006	mohan6@mail.com	\N	f
7	5	Rohit Verma	rohit7@student.com	7	A	8000000007	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-11498	Ajay Verma	9000000007	ajay7@mail.com	\N	f
8	5	Karthik Reddy	karthik8@student.com	7	B	8000000008	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-27678	Ravi Reddy	9000000008	ravi8@mail.com	\N	f
9	5	Harsha V	harsha9@student.com	7	C	8000000009	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-38118	Venkat V	9000000009	venkat9@mail.com	\N	f
10	5	Manish Jain	manish10@student.com	7	A	8000000010	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-19006	Deepak Jain	9000000010	deepak10@mail.com	\N	f
11	5	Sneha Iyer	sneha11@student.com	8	A	8000000011	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-93223	Sridhar Iyer	9000000011	sridhar11@mail.com	\N	f
12	5	Anjali Mehta	anjali12@student.com	8	B	8000000012	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-16341	Manoj Mehta	9000000012	manoj12@mail.com	\N	f
13	5	Pooja Nair	pooja13@student.com	8	C	8000000013	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-23867	Suresh Nair	9000000013	suresh13@mail.com	\N	f
14	5	Divya Rao	divya14@student.com	8	A	8000000014	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-84227	Krishna Rao	9000000014	krishna14@mail.com	\N	f
15	5	Lavanya S	lavanya15@student.com	8	B	8000000015	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-35051	Srinivas S	9000000015	srinivas15@mail.com	\N	f
16	5	Nisha Kapoor	nisha16@student.com	8	C	8000000016	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-19274	Anil Kapoor	9000000016	anil16@mail.com	\N	f
17	5	Preeti Joshi	preeti17@student.com	8	A	8000000017	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-37857	Sunil Joshi	9000000017	sunil17@mail.com	\N	f
18	5	Bhavana M	bhavana18@student.com	8	B	8000000018	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-46252	Murali M	9000000018	murali18@mail.com	\N	f
19	5	Deepika S	deepika19@student.com	8	C	8000000019	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-46427	Satish S	9000000019	satish19@mail.com	\N	f
20	5	Gita P	gita20@student.com	8	A	8000000020	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-77711	Prasad P	9000000020	prasad20@mail.com	\N	f
21	5	Rahul Kumar	rahul21@student.com	9	A	8000000021	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-63496	Suresh Kumar	9000000021	suresh21@mail.com	\N	f
22	5	Neha Singh	neha22@student.com	9	B	8000000022	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-54737	Rajesh Singh	9000000022	rajesh22@mail.com	\N	f
23	5	Vikram Das	vikram23@student.com	9	C	8000000023	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-39304	Amit Das	9000000023	amit23@mail.com	\N	f
24	5	Tarun B	tarun24@student.com	9	A	8000000024	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-62979	Balaji B	9000000024	balaji24@mail.com	\N	f
25	5	Om Prakash	om25@student.com	9	B	8000000025	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-99196	Shiv Prakash	9000000025	shiv25@mail.com	\N	f
26	5	Farhan Ali	farhan26@student.com	9	C	8000000026	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-22396	Akbar Ali	9000000026	akbar26@mail.com	\N	f
27	5	Eshwar L	eshwar27@student.com	9	A	8000000027	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-85163	Lokesh L	9000000027	lokesh27@mail.com	\N	f
28	5	Chaitanya K	chaitanya28@student.com	9	B	8000000028	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-77811	Kishore K	9000000028	kishore28@mail.com	\N	f
29	5	Varun P	varun29@student.com	9	C	8000000029	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-74377	Prakash P	9000000029	prakash29@mail.com	\N	f
30	5	Yash Agarwal	yash30@student.com	9	A	8000000030	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-23235	Ankit Agarwal	9000000030	ankit30@mail.com	\N	f
31	5	Priya Patel	priya31@student.com	10	A	8000000031	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-59359	Ramesh Patel	9000000031	ramesh31@mail.com	\N	f
32	5	Ravi Teja	ravi32@student.com	10	B	8000000032	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-15701	Mohan Teja	9000000032	mohan32@mail.com	\N	f
33	5	Sanjana R	sanjana33@student.com	10	C	8000000033	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-63535	Rajesh R	9000000033	rajesh33@mail.com	\N	f
34	5	Amit Yadav	amit34@student.com	10	A	8000000034	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-10404	Rakesh Yadav	9000000034	rakesh34@mail.com	\N	f
35	5	Zoya Khan	zoya35@student.com	10	B	8000000035	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-75332	Imran Khan	9000000035	imran35@mail.com	\N	f
36	5	Abhishek T	abhishek36@student.com	10	C	8000000036	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-28406	Teja T	9000000036	teja36@mail.com	\N	f
37	5	Kiran Reddy	kiran37@student.com	10	A	8000000037	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-93266	Ravi Reddy	9000000037	ravi37@mail.com	\N	f
38	5	Meena Gupta	meena38@student.com	10	B	8000000038	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-46774	Sanjay Gupta	9000000038	sanjay38@mail.com	\N	f
39	5	Rohit Verma	rohit39@student.com	10	C	8000000039	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-92256	Anil Verma	9000000039	anil39@mail.com	\N	f
40	5	Arjun Patel	arjun40@student.com	10	A	8000000040	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-59257	Paresh Patel	9000000040	paresh40@mail.com	\N	f
41	5	Pooja Sharma	pooja41@student.com	11	A	8000000041	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-51011	Rajesh Sharma	9000000041	rajesh41@mail.com	\N	f
42	5	Vikas Reddy	vikas42@student.com	11	B	8000000042	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-31966	Suresh Reddy	9000000042	suresh42@mail.com	\N	f
43	5	Ananya Singh	ananya43@student.com	11	C	8000000043	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-81756	Rajesh Singh	9000000043	rajesh43@mail.com	\N	f
44	5	Ritesh Kumar	ritesh44@student.com	11	A	8000000044	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-31141	Suresh Kumar	9000000044	suresh44@mail.com	\N	f
45	5	Divya Nair	divya45@student.com	11	B	8000000045	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-45579	Suresh Nair	9000000045	suresh45@mail.com	\N	f
46	5	Kunal Jain	kunal46@student.com	11	C	8000000046	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-28948	Deepak Jain	9000000046	deepak46@mail.com	\N	f
47	5	Snehal Patil	snehal47@student.com	11	A	8000000047	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-60238	Anil Patil	9000000047	anil47@mail.com	\N	f
48	5	Harish Rao	harish48@student.com	11	B	8000000048	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-18822	Krishna Rao	9000000048	krishna48@mail.com	\N	f
49	5	Nitin Gupta	nitin49@student.com	11	C	8000000049	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-73857	Sanjay Gupta	9000000049	sanjay49@mail.com	\N	f
50	5	Rahul Das	rahul50@student.com	11	A	8000000050	active	2026-03-20 15:12:33.03868	wlyl-stu-dsc-65735	Amit Das	9000000050	amit50@mail.com	\N	f
\.


--
-- Data for Name: substitute_assignments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.substitute_assignments (id, school_id, leave_request_id, original_teacher_id, substitute_teacher_id, class_id, date, day_of_week, period_number, subject_name, time_from, time_to, created_at) FROM stdin;
2	5	4	108	102	45	2026-03-23	Monday	1	Telugu	08:00	08:45	2026-03-22 12:21:57.015565
3	5	4	108	102	51	2026-03-23	Monday	2	Telugu	08:50	09:35	2026-03-22 12:21:57.031423
4	5	4	108	102	59	2026-03-23	Monday	3	Telugu	09:40	10:25	2026-03-22 12:21:57.033094
5	5	4	108	102	47	2026-03-23	Monday	4	Telugu	10:45	11:30	2026-03-22 12:21:57.035282
6	5	4	108	102	45	2026-03-23	Monday	5	Telugu	11:35	12:20	2026-03-22 12:21:57.037081
7	5	4	108	102	51	2026-03-23	Monday	6	Telugu	12:25	13:10	2026-03-22 12:21:57.038778
8	5	7	99	102	48	2026-03-25	Wednesday	1	Hindi	08:00	08:45	2026-03-22 12:36:14.292964
9	5	7	99	102	43	2026-03-25	Wednesday	2	Hindi	08:50	09:35	2026-03-22 12:36:14.327204
10	5	7	99	102	51	2026-03-25	Wednesday	3	Hindi	09:40	10:25	2026-03-22 12:36:14.329747
11	5	7	99	102	61	2026-03-25	Wednesday	4	Hindi	10:45	11:30	2026-03-22 12:36:14.332528
12	5	7	99	102	47	2026-03-25	Wednesday	6	Hindi	12:25	13:10	2026-03-22 12:36:14.335197
13	5	8	95	103	48	2026-03-20	Friday	1	Social Studies	08:00	08:45	2026-03-22 13:44:25.992426
14	5	8	95	107	51	2026-03-20	Friday	3	Social Studies	09:40	10:25	2026-03-22 13:44:26.004874
15	5	8	95	87	47	2026-03-20	Friday	5	Social Studies	11:35	12:20	2026-03-22 13:44:26.007312
16	5	8	95	104	61	2026-03-20	Friday	6	Social Studies	12:25	13:10	2026-03-22 13:44:26.009405
1	5	5	95	107	61	2026-03-23	Monday	6	Social Studies	12:25	13:10	2026-03-22 12:04:54.487893
38	5	\N	90	88	51	2026-03-24	Tuesday	2	Mathematics	08:50	09:35	2026-03-22 19:27:53.640485
39	5	\N	90	92	61	2026-03-24	Tuesday	3	Mathematics	09:40	10:25	2026-03-22 19:27:53.669446
40	5	\N	90	98	47	2026-03-24	Tuesday	6	Mathematics	12:25	13:10	2026-03-22 19:27:53.67157
44	5	\N	91	174	61	2026-03-25	Wednesday	3	Mathematics	09:40	10:25	2026-03-22 19:33:33.367978
45	5	\N	91	174	45	2026-03-25	Wednesday	4	Mathematics	10:45	11:30	2026-03-22 19:33:33.379217
46	5	\N	91	174	49	2026-03-25	Wednesday	5	Mathematics	11:35	12:20	2026-03-22 19:33:33.381449
47	5	\N	91	174	55	2026-03-25	Wednesday	6	Mathematics	12:25	13:10	2026-03-22 19:33:33.383382
48	5	38	108	174	49	2026-03-26	Thursday	1	Telugu	08:00	08:45	2026-03-25 20:48:46.770908
49	5	38	108	102	61	2026-03-26	Thursday	2	Telugu	08:50	09:35	2026-03-25 20:48:46.786337
50	5	38	108	93	45	2026-03-26	Thursday	3	Telugu	09:40	10:25	2026-03-25 20:48:46.78914
51	5	38	108	93	51	2026-03-26	Thursday	4	Telugu	10:45	11:30	2026-03-25 20:48:46.790825
52	5	38	108	93	59	2026-03-26	Thursday	5	Telugu	11:35	12:20	2026-03-25 20:48:46.792404
53	5	38	108	99	47	2026-03-26	Thursday	6	Telugu	12:25	13:10	2026-03-25 20:48:46.79449
\.


--
-- Data for Name: syllabus_topics; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.syllabus_topics (id, school_id, class_id, subject, chapter_name, chapter_order, topic_name, topic_order, status, covered_date, covered_by, created_at) FROM stdin;
\.


--
-- Data for Name: task_reminders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.task_reminders (id, task_id, school_id, sent_by, sent_at, target_type, student_count, student_ids) FROM stdin;
\.


--
-- Data for Name: task_submissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.task_submissions (id, task_id, student_id, school_id, submitted_at, submission_text, file_url, file_name, file_public_id, file_size_kb, score, feedback, status, resubmission_requested, reviewed_at, reviewed_by) FROM stdin;
1	3	17	5	2026-03-27 21:39:00+05:30	lkjhgfdxcvbnjkl	\N	\N	\N	\N	\N	\N	pending	f	\N	\N
2	2	14	5	2026-03-27 21:43:00+05:30	m;klkhhfdgdghghk'l;	\N	\N	\N	\N	\N	\N	pending	f	\N	\N
\.


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tasks (id, school_id, class_id, teacher_id, title, subject, task_type, max_marks, instructions, assigned_to, status, due_date, due_time, created_at, updated_at) FROM stdin;
1	5	43	108	read lesson 1	telugu	homework	10	read and write	all	published	2026-03-30	23:59:00	2026-03-26 21:20:30.830951+05:30	2026-03-26 21:20:30.830951+05:30
2	5	43	108	g	telugu	homework	10	aesghfk	all	published	2026-03-30	23:59:00	2026-03-27 06:41:57.949211+05:30	2026-03-27 06:41:57.949211+05:30
3	5	43	90	ddfg	Mathematics	homework	10	fgfhv	all	published	2026-03-31	23:59:00	2026-03-27 07:17:43.360616+05:30	2026-03-27 07:17:43.360616+05:30
4	5	43	108	sffbdg	telugu	homework	10	rdhfmv	all	published	2026-04-09	23:59:00	2026-03-31 20:04:21.181998+05:30	2026-03-31 20:04:21.181998+05:30
5	5	43	108	task1	telugu	homework	10	read and subit chapter 1	all	published	2026-04-09	23:59:00	2026-03-31 20:05:15.603805+05:30	2026-03-31 20:05:15.603805+05:30
\.


--
-- Data for Name: teacher_unavailability; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.teacher_unavailability (id, teacher_id, school_id, day_of_week, period_number, reason, created_at) FROM stdin;
\.


--
-- Data for Name: teachers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.teachers (id, school_id, name, email, subject, phone, status, created_at, employee_id, department, qualification, date_of_joining, staff_type, teaches_grades, password_hash, password_changed) FROM stdin;
173	15	sumanath	k@gmail.com	Telugu	9014760546	active	2026-03-22 19:31:23.311988	wlyl-tea-tmptest3-16340	Telugu	B.ED	2026-03-22	teaching	\N	\N	f
79	5	Suresh Kumar	suresh@school.com	English	9876543214	active	2026-03-20 15:07:46.145459	wlyl-tea-dsc-14488	Arts	M.A	2020-06-12	teaching	6A,6B,7A	\N	f
80	5	Neha Singh	neha@school.com	History	9876543215	active	2026-03-20 15:07:46.145459	wlyl-tea-dsc-11398	Arts	M.A	2022-09-05	teaching	8B,9A,9C	\N	f
81	5	Arjun Patel	arjun@school.com	Geography	9876543216	active	2026-03-20 15:07:46.145459	wlyl-tea-dsc-81803	Arts	B.Ed	2021-11-18	teaching	7A,8A,8B	\N	f
85	5	Ramesh Gupta	ramesh@school.com	\N	9876543220	active	2026-03-20 15:08:08.465647	wlyl-tea-dsc-70350	Administration	B.Com	2019-05-10	teaching	\N	\N	f
86	5	Lakshmi Devi	lakshmi@school.com	\N	9876543221	active	2026-03-20 15:08:08.465647	wlyl-tea-dsc-42985	Office	M.A	2020-08-15	teaching	\N	\N	f
87	5	Sanjay Kumar	sanjay@school.com	\N	9876543222	active	2026-03-20 15:08:08.465647	wlyl-tea-dsc-76171	Accounts	M.Com	2018-03-22	teaching	\N	\N	f
88	5	Meena Rao	meena@school.com	\N	9876543223	active	2026-03-20 15:08:08.465647	wlyl-tea-dsc-36545	Library	B.Lib	2021-07-01	teaching	\N	\N	f
91	5	Amit Verma	amit.verma@school.com	Mathematics	9876500002	active	2026-03-20 16:44:11.947247	wlyl-tea-dsc-18578	Mathematics	B.Ed B.Sc	2019-07-15	teaching	7A,7B,6A,6B	\N	f
92	5	Sunita Rao	sunita.rao@school.com	Science	9876500003	active	2026-03-20 16:44:11.947247	wlyl-tea-dsc-13302	Science	B.Ed M.Sc	2021-03-10	teaching	8A,8B	\N	f
93	5	Rahul Gupta	rahul.gupta@school.com	Science	9876500004	active	2026-03-20 16:44:11.947247	wlyl-tea-dsc-76241	Science	M.Sc B.Ed	2018-06-15	teaching	9A,9B,10A,10B	\N	f
94	5	Meena Pillai	meena.pillai@school.com	Social Studies	9876500005	active	2026-03-20 16:44:11.947247	wlyl-tea-dsc-87788	Social Sciences	M.A B.Ed	2020-08-01	teaching	6A,6B,7A,7B	\N	f
95	5	Ramesh Iyer	ramesh.iyer@school.com	Social Studies	9876500006	active	2026-03-20 16:44:11.947247	wlyl-tea-dsc-47580	Social Sciences	M.A B.Ed	2017-06-01	teaching	8A,8B,9A,9B,10A,10B	\N	f
96	5	Anita Singh	anita.singh@school.com	English	9876500007	active	2026-03-20 16:44:11.947247	wlyl-tea-dsc-85089	Languages	M.A English B.Ed	2022-01-05	teaching	6A,6B,7A,7B	\N	f
97	5	Deepak Mishra	deepak.mishra@school.com	English	9876500008	active	2026-03-20 16:44:11.947247	wlyl-tea-dsc-22046	Languages	M.A B.Ed	2019-04-20	teaching	8A,8B,9A,9B,10A,10B	\N	f
98	5	Kavita Patel	kavita.patel@school.com	Hindi	9876500009	active	2026-03-20 16:44:11.947247	wlyl-tea-dsc-24921	Languages	M.A Hindi B.Ed	2021-07-12	teaching	6A,6B,7A,7B,8A,8B	\N	f
99	5	Suresh Nair	suresh.nair@school.com	Hindi	9876500010	active	2026-03-20 16:44:11.947247	wlyl-tea-dsc-75321	Languages	M.A B.Ed	2016-06-01	teaching	9A,9B,10A,10B	\N	f
100	5	Pooja Reddy	pooja.reddy@school.com	Computer Science	9876500011	active	2026-03-20 16:44:11.947247	wlyl-tea-dsc-35843	Technology	B.Tech B.Ed	2023-01-10	teaching	\N	\N	f
101	5	Vijay Kumar	vijay.kumar@school.com	Computer Science	9876500012	active	2026-03-20 16:44:11.947247	wlyl-tea-dsc-46350	Technology	MCA B.Ed	2020-09-01	teaching	9A,9B,10A,10B	\N	f
102	5	Rekha Sharma	rekha.sharma@school.com	Physical Education	9876500013	active	2026-03-20 16:44:11.947247	wlyl-tea-dsc-46276	Sports	B.P.Ed	2018-06-01	teaching	6A,6B,7A,7B,8A,8B,9A,9B,10A,10B	\N	f
103	5	Nandini Bose	nandini.bose@school.com	Science	9876500014	active	2026-03-20 16:44:11.947247	wlyl-tea-dsc-97446	Science	M.Sc Chemistry B.Ed	2022-07-01	teaching	6A,6B,7A,7B	\N	f
104	5	Dr. Arun Kumar	arun.kumar@school.com	\N	9876500015	active	2026-03-20 16:44:11.947247	wlyl-tea-dsc-43611	Administration	Ph.D	2010-04-01	non_teaching	\N	\N	f
105	5	Lata Menon	lata.menon@school.com	\N	9876500016	active	2026-03-20 16:44:11.947247	wlyl-tea-dsc-74433	Library	M.Lib	2015-06-01	non_teaching	\N	\N	f
106	5	Gopal Das	gopal.das@school.com	\N	9876500017	active	2026-03-20 16:44:11.947247	wlyl-tea-dsc-11240	Administration	B.Com	2018-01-15	non_teaching	\N	\N	f
107	5	Rajani Kumari	rajani.k@school.com	\N	9876500018	active	2026-03-20 16:44:11.947247	wlyl-tea-dsc-74751	Health	GNM	2019-08-01	non_teaching	\N	\N	f
90	5	Priya Sharma	priya.sharma@school.com	Mathematics	9876500001	active	2026-03-20 16:44:11.947247	wlyl-tea-dsc-33093	Mathematics	B.Ed M.Sc	2026-03-19	teaching	8A,8B,9A,9B	\N	f
108	5	kowsik	priya.sharma@school.com	telugu	9876501001	active	2026-03-20 22:57:46.277423	wlyl-tea-dsc-30541	telugu	B.Ed M.Sc	2020-06-01	teaching	8A,8B,9A,9B	\N	f
174	5	Sumanth	k@gmail.com	Telugu	8787878787	active	2026-03-22 19:32:52.304604	wlyl-tea-dsc-56313	Telugu	BED	2026-03-25	teaching	\N	\N	f
\.


--
-- Data for Name: timetable; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.timetable (id, teacher_id, school_id, day_of_week, period_number, time_from, time_to, subject, grade, section, room, created_at) FROM stdin;
5961	108	5	Monday	1	08:30	09:25	Telugu	10	A	Room 110	2026-03-29 02:14:21.305842
5962	79	5	Monday	2	09:25	10:20	English	10	A	Room 110	2026-03-29 02:14:21.305842
5963	98	5	Monday	3	10:20	11:15	Hindi	10	A	Room 110	2026-03-29 02:14:21.305842
5964	91	5	Monday	5	11:30	12:25	Mathematics	10	A	Room 110	2026-03-29 02:14:21.305842
5965	94	5	Monday	6	12:25	13:20	Social Studies	10	A	Room 110	2026-03-29 02:14:21.305842
5966	100	5	Monday	8	14:05	15:00	Computer Science	10	A	Computer Lab	2026-03-29 02:14:21.305842
5967	108	5	Monday	9	15:00	15:55	Telugu	10	A	Room 110	2026-03-29 02:14:21.305842
5968	79	5	Monday	11	16:05	17:00	English	10	A	Room 110	2026-03-29 02:14:21.305842
5969	98	5	Tuesday	1	08:30	09:25	Hindi	10	A	Room 110	2026-03-29 02:14:21.305842
5970	91	5	Tuesday	2	09:25	10:20	Mathematics	10	A	Room 110	2026-03-29 02:14:21.305842
5971	94	5	Tuesday	3	10:20	11:15	Social Studies	10	A	Room 110	2026-03-29 02:14:21.305842
5972	100	5	Tuesday	5	11:30	12:25	Computer Science	10	A	Computer Lab	2026-03-29 02:14:21.305842
5973	108	5	Tuesday	6	12:25	13:20	Telugu	10	A	Room 110	2026-03-29 02:14:21.305842
5974	79	5	Tuesday	8	14:05	15:00	English	10	A	Room 110	2026-03-29 02:14:21.305842
5975	98	5	Tuesday	9	15:00	15:55	Hindi	10	A	Room 110	2026-03-29 02:14:21.305842
5976	91	5	Tuesday	11	16:05	17:00	Mathematics	10	A	Room 110	2026-03-29 02:14:21.305842
5977	94	5	Wednesday	1	08:30	09:25	Social Studies	10	A	Room 110	2026-03-29 02:14:21.305842
5978	100	5	Wednesday	2	09:25	10:20	Computer Science	10	A	Computer Lab	2026-03-29 02:14:21.305842
5979	108	5	Wednesday	3	10:20	11:15	Telugu	10	A	Room 110	2026-03-29 02:14:21.305842
5980	79	5	Wednesday	5	11:30	12:25	English	10	A	Room 110	2026-03-29 02:14:21.305842
5981	98	5	Wednesday	6	12:25	13:20	Hindi	10	A	Room 110	2026-03-29 02:14:21.305842
5982	91	5	Wednesday	8	14:05	15:00	Mathematics	10	A	Room 110	2026-03-29 02:14:21.305842
5983	94	5	Wednesday	9	15:00	15:55	Social Studies	10	A	Room 110	2026-03-29 02:14:21.305842
5984	100	5	Wednesday	11	16:05	17:00	Computer Science	10	A	Computer Lab	2026-03-29 02:14:21.305842
5985	108	5	Thursday	1	08:30	09:25	Telugu	10	A	Room 110	2026-03-29 02:14:21.305842
5986	79	5	Thursday	2	09:25	10:20	English	10	A	Room 110	2026-03-29 02:14:21.305842
5987	98	5	Thursday	3	10:20	11:15	Hindi	10	A	Room 110	2026-03-29 02:14:21.305842
5988	91	5	Thursday	5	11:30	12:25	Mathematics	10	A	Room 110	2026-03-29 02:14:21.305842
5989	94	5	Thursday	6	12:25	13:20	Social Studies	10	A	Room 110	2026-03-29 02:14:21.305842
5990	100	5	Thursday	8	14:05	15:00	Computer Science	10	A	Computer Lab	2026-03-29 02:14:21.305842
5991	108	5	Thursday	9	15:00	15:55	Telugu	10	A	Room 110	2026-03-29 02:14:21.305842
5992	79	5	Thursday	11	16:05	17:00	English	10	A	Room 110	2026-03-29 02:14:21.305842
5993	98	5	Friday	1	08:30	09:25	Hindi	10	A	Room 110	2026-03-29 02:14:21.305842
5994	91	5	Friday	2	09:25	10:20	Mathematics	10	A	Room 110	2026-03-29 02:14:21.305842
5995	94	5	Friday	3	10:20	11:15	Social Studies	10	A	Room 110	2026-03-29 02:14:21.305842
5996	100	5	Friday	5	11:30	12:25	Computer Science	10	A	Computer Lab	2026-03-29 02:14:21.305842
5997	174	5	Monday	1	08:30	09:25	Telugu	10	B	Room 110	2026-03-29 02:14:21.305842
5998	97	5	Monday	2	09:25	10:20	English	10	B	Room 110	2026-03-29 02:14:21.305842
5999	99	5	Monday	3	10:20	11:15	Hindi	10	B	Room 110	2026-03-29 02:14:21.305842
6000	94	5	Monday	5	11:30	12:25	Social Studies	10	B	Room 110	2026-03-29 02:14:21.305842
6001	91	5	Monday	6	12:25	13:20	Mathematics	10	B	Room 110	2026-03-29 02:14:21.305842
6002	101	5	Monday	8	14:05	15:00	Computer Science	10	B	Computer Lab	2026-03-29 02:14:21.305842
6003	174	5	Monday	9	15:00	15:55	Telugu	10	B	Room 110	2026-03-29 02:14:21.305842
6004	97	5	Monday	11	16:05	17:00	English	10	B	Room 110	2026-03-29 02:14:21.305842
6005	99	5	Tuesday	1	08:30	09:25	Hindi	10	B	Room 110	2026-03-29 02:14:21.305842
6006	94	5	Tuesday	2	09:25	10:20	Social Studies	10	B	Room 110	2026-03-29 02:14:21.305842
6007	91	5	Tuesday	3	10:20	11:15	Mathematics	10	B	Room 110	2026-03-29 02:14:21.305842
6008	101	5	Tuesday	5	11:30	12:25	Computer Science	10	B	Computer Lab	2026-03-29 02:14:21.305842
6009	174	5	Tuesday	6	12:25	13:20	Telugu	10	B	Room 110	2026-03-29 02:14:21.305842
6010	97	5	Tuesday	8	14:05	15:00	English	10	B	Room 110	2026-03-29 02:14:21.305842
6011	99	5	Tuesday	9	15:00	15:55	Hindi	10	B	Room 110	2026-03-29 02:14:21.305842
6012	94	5	Tuesday	11	16:05	17:00	Social Studies	10	B	Room 110	2026-03-29 02:14:21.305842
6013	91	5	Wednesday	1	08:30	09:25	Mathematics	10	B	Room 110	2026-03-29 02:14:21.305842
6014	101	5	Wednesday	2	09:25	10:20	Computer Science	10	B	Computer Lab	2026-03-29 02:14:21.305842
6015	174	5	Wednesday	3	10:20	11:15	Telugu	10	B	Room 110	2026-03-29 02:14:21.305842
6016	97	5	Wednesday	5	11:30	12:25	English	10	B	Room 110	2026-03-29 02:14:21.305842
6017	99	5	Wednesday	6	12:25	13:20	Hindi	10	B	Room 110	2026-03-29 02:14:21.305842
6018	94	5	Wednesday	8	14:05	15:00	Social Studies	10	B	Room 110	2026-03-29 02:14:21.305842
6019	91	5	Wednesday	9	15:00	15:55	Mathematics	10	B	Room 110	2026-03-29 02:14:21.305842
6020	101	5	Wednesday	11	16:05	17:00	Computer Science	10	B	Computer Lab	2026-03-29 02:14:21.305842
6021	174	5	Thursday	1	08:30	09:25	Telugu	10	B	Room 110	2026-03-29 02:14:21.305842
6022	97	5	Thursday	2	09:25	10:20	English	10	B	Room 110	2026-03-29 02:14:21.305842
6023	99	5	Thursday	3	10:20	11:15	Hindi	10	B	Room 110	2026-03-29 02:14:21.305842
6024	94	5	Thursday	5	11:30	12:25	Social Studies	10	B	Room 110	2026-03-29 02:14:21.305842
6025	91	5	Thursday	6	12:25	13:20	Mathematics	10	B	Room 110	2026-03-29 02:14:21.305842
6026	101	5	Thursday	8	14:05	15:00	Computer Science	10	B	Computer Lab	2026-03-29 02:14:21.305842
6027	174	5	Thursday	9	15:00	15:55	Telugu	10	B	Room 110	2026-03-29 02:14:21.305842
6028	97	5	Thursday	11	16:05	17:00	English	10	B	Room 110	2026-03-29 02:14:21.305842
6029	99	5	Friday	1	08:30	09:25	Hindi	10	B	Room 110	2026-03-29 02:14:21.305842
6030	94	5	Friday	2	09:25	10:20	Social Studies	10	B	Room 110	2026-03-29 02:14:21.305842
6031	91	5	Friday	3	10:20	11:15	Mathematics	10	B	Room 110	2026-03-29 02:14:21.305842
6032	101	5	Friday	5	11:30	12:25	Computer Science	10	B	Computer Lab	2026-03-29 02:14:21.305842
6033	79	5	Monday	1	08:30	09:25	English	6	A	Room 106	2026-03-29 02:14:21.305842
6034	108	5	Monday	2	09:25	10:20	Telugu	6	A	Room 106	2026-03-29 02:14:21.305842
6035	91	5	Monday	3	10:20	11:15	Mathematics	6	A	Room 106	2026-03-29 02:14:21.305842
6036	98	5	Monday	5	11:30	12:25	Hindi	6	A	Room 106	2026-03-29 02:14:21.305842
6037	108	5	Monday	6	12:25	13:20	Telugu	6	A	Room 106	2026-03-29 02:14:21.305842
6038	79	5	Monday	8	14:05	15:00	English	6	A	Room 106	2026-03-29 02:14:21.305842
6039	98	5	Monday	9	15:00	15:55	Hindi	6	A	Room 106	2026-03-29 02:14:21.305842
6040	91	5	Monday	11	16:05	17:00	Mathematics	6	A	Room 106	2026-03-29 02:14:21.305842
6041	94	5	Tuesday	1	08:30	09:25	Social Studies	6	A	Room 106	2026-03-29 02:14:21.305842
6042	108	5	Tuesday	2	09:25	10:20	Telugu	6	A	Room 106	2026-03-29 02:14:21.305842
6043	79	5	Tuesday	3	10:20	11:15	English	6	A	Room 106	2026-03-29 02:14:21.305842
6044	98	5	Tuesday	5	11:30	12:25	Hindi	6	A	Room 106	2026-03-29 02:14:21.305842
6045	91	5	Tuesday	6	12:25	13:20	Mathematics	6	A	Room 106	2026-03-29 02:14:21.305842
6046	94	5	Tuesday	8	14:05	15:00	Social Studies	6	A	Room 106	2026-03-29 02:14:21.305842
6047	108	5	Tuesday	9	15:00	15:55	Telugu	6	A	Room 106	2026-03-29 02:14:21.305842
6048	79	5	Tuesday	11	16:05	17:00	English	6	A	Room 106	2026-03-29 02:14:21.305842
6049	98	5	Wednesday	1	08:30	09:25	Hindi	6	A	Room 106	2026-03-29 02:14:21.305842
6050	91	5	Wednesday	2	09:25	10:20	Mathematics	6	A	Room 106	2026-03-29 02:14:21.305842
6051	94	5	Wednesday	3	10:20	11:15	Social Studies	6	A	Room 106	2026-03-29 02:14:21.305842
6052	108	5	Wednesday	5	11:30	12:25	Telugu	6	A	Room 106	2026-03-29 02:14:21.305842
6053	79	5	Wednesday	6	12:25	13:20	English	6	A	Room 106	2026-03-29 02:14:21.305842
6054	98	5	Wednesday	8	14:05	15:00	Hindi	6	A	Room 106	2026-03-29 02:14:21.305842
6055	108	5	Wednesday	9	15:00	15:55	Telugu	6	A	Room 106	2026-03-29 02:14:21.305842
6056	91	5	Wednesday	11	16:05	17:00	Mathematics	6	A	Room 106	2026-03-29 02:14:21.305842
6057	94	5	Thursday	1	08:30	09:25	Social Studies	6	A	Room 106	2026-03-29 02:14:21.305842
6058	96	5	Thursday	2	09:25	10:20	English	6	A	Room 106	2026-03-29 02:14:21.305842
6059	91	5	Thursday	3	10:20	11:15	Mathematics	6	A	Room 106	2026-03-29 02:14:21.305842
6060	98	5	Thursday	5	11:30	12:25	Hindi	6	A	Room 106	2026-03-29 02:14:21.305842
6061	108	5	Thursday	6	12:25	13:20	Telugu	6	A	Room 106	2026-03-29 02:14:21.305842
6062	94	5	Thursday	8	14:05	15:00	Social Studies	6	A	Room 106	2026-03-29 02:14:21.305842
6063	79	5	Thursday	9	15:00	15:55	English	6	A	Room 106	2026-03-29 02:14:21.305842
6064	98	5	Thursday	11	16:05	17:00	Hindi	6	A	Room 106	2026-03-29 02:14:21.305842
6065	91	5	Friday	1	08:30	09:25	Mathematics	6	A	Room 106	2026-03-29 02:14:21.305842
6066	94	5	Friday	5	11:30	12:25	Social Studies	6	A	Room 106	2026-03-29 02:14:21.305842
6067	96	5	Monday	1	08:30	09:25	English	6	B	Room 106	2026-03-29 02:14:21.305842
6068	174	5	Monday	2	09:25	10:20	Telugu	6	B	Room 106	2026-03-29 02:14:21.305842
6069	79	5	Monday	3	10:20	11:15	English	6	B	Room 106	2026-03-29 02:14:21.305842
6070	108	5	Monday	5	11:30	12:25	Telugu	6	B	Room 106	2026-03-29 02:14:21.305842
6071	98	5	Monday	6	12:25	13:20	Hindi	6	B	Room 106	2026-03-29 02:14:21.305842
6072	91	5	Monday	8	14:05	15:00	Mathematics	6	B	Room 106	2026-03-29 02:14:21.305842
6073	94	5	Monday	9	15:00	15:55	Social Studies	6	B	Room 106	2026-03-29 02:14:21.305842
6074	98	5	Monday	11	16:05	17:00	Hindi	6	B	Room 106	2026-03-29 02:14:21.305842
6075	91	5	Tuesday	1	08:30	09:25	Mathematics	6	B	Room 106	2026-03-29 02:14:21.305842
6076	174	5	Tuesday	2	09:25	10:20	Telugu	6	B	Room 106	2026-03-29 02:14:21.305842
6077	96	5	Tuesday	3	10:20	11:15	English	6	B	Room 106	2026-03-29 02:14:21.305842
6078	91	5	Tuesday	5	11:30	12:25	Mathematics	6	B	Room 106	2026-03-29 02:14:21.305842
6079	98	5	Tuesday	6	12:25	13:20	Hindi	6	B	Room 106	2026-03-29 02:14:21.305842
6080	108	5	Tuesday	8	14:05	15:00	Telugu	6	B	Room 106	2026-03-29 02:14:21.305842
6081	94	5	Tuesday	9	15:00	15:55	Social Studies	6	B	Room 106	2026-03-29 02:14:21.305842
6082	96	5	Tuesday	11	16:05	17:00	English	6	B	Room 106	2026-03-29 02:14:21.305842
6083	108	5	Wednesday	1	08:30	09:25	Telugu	6	B	Room 106	2026-03-29 02:14:21.305842
6084	98	5	Wednesday	2	09:25	10:20	Hindi	6	B	Room 106	2026-03-29 02:14:21.305842
6085	91	5	Wednesday	3	10:20	11:15	Mathematics	6	B	Room 106	2026-03-29 02:14:21.305842
6086	94	5	Wednesday	5	11:30	12:25	Social Studies	6	B	Room 106	2026-03-29 02:14:21.305842
6087	96	5	Wednesday	6	12:25	13:20	English	6	B	Room 106	2026-03-29 02:14:21.305842
6088	108	5	Wednesday	8	14:05	15:00	Telugu	6	B	Room 106	2026-03-29 02:14:21.305842
6089	98	5	Wednesday	9	15:00	15:55	Hindi	6	B	Room 106	2026-03-29 02:14:21.305842
6090	94	5	Wednesday	11	16:05	17:00	Social Studies	6	B	Room 106	2026-03-29 02:14:21.305842
6091	91	5	Thursday	1	08:30	09:25	Mathematics	6	B	Room 106	2026-03-29 02:14:21.305842
6092	98	5	Thursday	2	09:25	10:20	Hindi	6	B	Room 106	2026-03-29 02:14:21.305842
6093	79	5	Thursday	3	10:20	11:15	English	6	B	Room 106	2026-03-29 02:14:21.305842
6094	108	5	Thursday	5	11:30	12:25	Telugu	6	B	Room 106	2026-03-29 02:14:21.305842
6095	79	5	Thursday	6	12:25	13:20	English	6	B	Room 106	2026-03-29 02:14:21.305842
6096	91	5	Thursday	8	14:05	15:00	Mathematics	6	B	Room 106	2026-03-29 02:14:21.305842
6097	94	5	Thursday	9	15:00	15:55	Social Studies	6	B	Room 106	2026-03-29 02:14:21.305842
6098	94	5	Thursday	11	16:05	17:00	Social Studies	6	B	Room 106	2026-03-29 02:14:21.305842
6099	98	5	Friday	2	09:25	10:20	Hindi	6	B	Room 106	2026-03-29 02:14:21.305842
6100	91	5	Friday	5	11:30	12:25	Mathematics	6	B	Room 106	2026-03-29 02:14:21.305842
6101	98	5	Monday	1	08:30	09:25	Hindi	7	A	Room 107	2026-03-29 02:14:21.305842
6102	96	5	Monday	2	09:25	10:20	English	7	A	Room 107	2026-03-29 02:14:21.305842
6103	108	5	Monday	3	10:20	11:15	Telugu	7	A	Room 107	2026-03-29 02:14:21.305842
6104	79	5	Monday	5	11:30	12:25	English	7	A	Room 107	2026-03-29 02:14:21.305842
6105	174	5	Monday	6	12:25	13:20	Telugu	7	A	Room 107	2026-03-29 02:14:21.305842
6106	98	5	Monday	8	14:05	15:00	Hindi	7	A	Room 107	2026-03-29 02:14:21.305842
6107	91	5	Monday	9	15:00	15:55	Mathematics	7	A	Room 107	2026-03-29 02:14:21.305842
6108	94	5	Monday	11	16:05	17:00	Social Studies	7	A	Room 107	2026-03-29 02:14:21.305842
6109	108	5	Tuesday	1	08:30	09:25	Telugu	7	A	Room 107	2026-03-29 02:14:21.305842
6110	79	5	Tuesday	2	09:25	10:20	English	7	A	Room 107	2026-03-29 02:14:21.305842
6111	98	5	Tuesday	3	10:20	11:15	Hindi	7	A	Room 107	2026-03-29 02:14:21.305842
6112	94	5	Tuesday	5	11:30	12:25	Social Studies	7	A	Room 107	2026-03-29 02:14:21.305842
6113	79	5	Tuesday	6	12:25	13:20	English	7	A	Room 107	2026-03-29 02:14:21.305842
6114	91	5	Tuesday	8	14:05	15:00	Mathematics	7	A	Room 107	2026-03-29 02:14:21.305842
6115	174	5	Tuesday	9	15:00	15:55	Telugu	7	A	Room 107	2026-03-29 02:14:21.305842
6116	98	5	Tuesday	11	16:05	17:00	Hindi	7	A	Room 107	2026-03-29 02:14:21.305842
6117	174	5	Wednesday	1	08:30	09:25	Telugu	7	A	Room 107	2026-03-29 02:14:21.305842
6118	94	5	Wednesday	2	09:25	10:20	Social Studies	7	A	Room 107	2026-03-29 02:14:21.305842
6119	79	5	Wednesday	3	10:20	11:15	English	7	A	Room 107	2026-03-29 02:14:21.305842
6120	91	5	Wednesday	5	11:30	12:25	Mathematics	7	A	Room 107	2026-03-29 02:14:21.305842
6121	94	5	Wednesday	6	12:25	13:20	Social Studies	7	A	Room 107	2026-03-29 02:14:21.305842
6122	174	5	Wednesday	8	14:05	15:00	Telugu	7	A	Room 107	2026-03-29 02:14:21.305842
6123	79	5	Wednesday	9	15:00	15:55	English	7	A	Room 107	2026-03-29 02:14:21.305842
6124	98	5	Wednesday	11	16:05	17:00	Hindi	7	A	Room 107	2026-03-29 02:14:21.305842
6125	98	5	Thursday	1	08:30	09:25	Hindi	7	A	Room 107	2026-03-29 02:14:21.305842
6126	91	5	Thursday	2	09:25	10:20	Mathematics	7	A	Room 107	2026-03-29 02:14:21.305842
6127	94	5	Thursday	3	10:20	11:15	Social Studies	7	A	Room 107	2026-03-29 02:14:21.305842
6128	174	5	Thursday	5	11:30	12:25	Telugu	7	A	Room 107	2026-03-29 02:14:21.305842
6129	96	5	Thursday	6	12:25	13:20	English	7	A	Room 107	2026-03-29 02:14:21.305842
6130	98	5	Thursday	8	14:05	15:00	Hindi	7	A	Room 107	2026-03-29 02:14:21.305842
6131	91	5	Thursday	9	15:00	15:55	Mathematics	7	A	Room 107	2026-03-29 02:14:21.305842
6132	91	5	Thursday	11	16:05	17:00	Mathematics	7	A	Room 107	2026-03-29 02:14:21.305842
6133	94	5	Friday	1	08:30	09:25	Social Studies	7	A	Room 107	2026-03-29 02:14:21.305842
6134	91	5	Friday	6	12:25	13:20	Mathematics	7	A	Room 107	2026-03-29 02:14:21.305842
6135	91	5	Monday	1	08:30	09:25	Mathematics	7	B	Room 107	2026-03-29 02:14:21.305842
6136	98	5	Monday	2	09:25	10:20	Hindi	7	B	Room 107	2026-03-29 02:14:21.305842
6137	174	5	Monday	3	10:20	11:15	Telugu	7	B	Room 107	2026-03-29 02:14:21.305842
6138	96	5	Monday	5	11:30	12:25	English	7	B	Room 107	2026-03-29 02:14:21.305842
6139	79	5	Monday	6	12:25	13:20	English	7	B	Room 107	2026-03-29 02:14:21.305842
6140	108	5	Monday	8	14:05	15:00	Telugu	7	B	Room 107	2026-03-29 02:14:21.305842
6141	79	5	Monday	9	15:00	15:55	English	7	B	Room 107	2026-03-29 02:14:21.305842
6142	108	5	Monday	11	16:05	17:00	Telugu	7	B	Room 107	2026-03-29 02:14:21.305842
6143	174	5	Tuesday	1	08:30	09:25	Telugu	7	B	Room 107	2026-03-29 02:14:21.305842
6144	98	5	Tuesday	2	09:25	10:20	Hindi	7	B	Room 107	2026-03-29 02:14:21.305842
6145	108	5	Tuesday	3	10:20	11:15	Telugu	7	B	Room 107	2026-03-29 02:14:21.305842
6146	79	5	Tuesday	5	11:30	12:25	English	7	B	Room 107	2026-03-29 02:14:21.305842
6147	94	5	Tuesday	6	12:25	13:20	Social Studies	7	B	Room 107	2026-03-29 02:14:21.305842
6148	98	5	Tuesday	8	14:05	15:00	Hindi	7	B	Room 107	2026-03-29 02:14:21.305842
6149	91	5	Tuesday	9	15:00	15:55	Mathematics	7	B	Room 107	2026-03-29 02:14:21.305842
6150	108	5	Tuesday	11	16:05	17:00	Telugu	7	B	Room 107	2026-03-29 02:14:21.305842
6151	79	5	Wednesday	1	08:30	09:25	English	7	B	Room 107	2026-03-29 02:14:21.305842
6152	108	5	Wednesday	2	09:25	10:20	Telugu	7	B	Room 107	2026-03-29 02:14:21.305842
6153	98	5	Wednesday	3	10:20	11:15	Hindi	7	B	Room 107	2026-03-29 02:14:21.305842
6154	96	5	Wednesday	5	11:30	12:25	English	7	B	Room 107	2026-03-29 02:14:21.305842
6155	91	5	Wednesday	6	12:25	13:20	Mathematics	7	B	Room 107	2026-03-29 02:14:21.305842
6156	79	5	Wednesday	8	14:05	15:00	English	7	B	Room 107	2026-03-29 02:14:21.305842
6157	94	5	Thursday	2	09:25	10:20	Social Studies	7	B	Room 107	2026-03-29 02:14:21.305842
6158	98	5	Thursday	6	12:25	13:20	Hindi	7	B	Room 107	2026-03-29 02:14:21.305842
6159	98	5	Thursday	9	15:00	15:55	Hindi	7	B	Room 107	2026-03-29 02:14:21.305842
6160	98	5	Friday	3	10:20	11:15	Hindi	7	B	Room 107	2026-03-29 02:14:21.305842
6161	94	5	Friday	6	12:25	13:20	Social Studies	7	B	Room 107	2026-03-29 02:14:21.305842
6162	91	5	Friday	8	14:05	15:00	Mathematics	7	B	Room 107	2026-03-29 02:14:21.305842
6163	91	5	Friday	9	15:00	15:55	Mathematics	7	B	Room 107	2026-03-29 02:14:21.305842
6164	94	5	Friday	11	16:05	17:00	Social Studies	7	B	Room 107	2026-03-29 02:14:21.305842
6165	91	5	Saturday	1	08:30	09:25	Mathematics	7	B	Room 107	2026-03-29 02:14:21.305842
6166	94	5	Saturday	2	09:25	10:20	Social Studies	7	B	Room 107	2026-03-29 02:14:21.305842
6167	94	5	Monday	1	08:30	09:25	Social Studies	7	C	Room 107	2026-03-29 02:14:21.305842
6168	91	5	Monday	2	09:25	10:20	Mathematics	7	C	Room 107	2026-03-29 02:14:21.305842
6169	94	5	Monday	3	10:20	11:15	Social Studies	7	C	Room 107	2026-03-29 02:14:21.305842
6170	174	5	Monday	5	11:30	12:25	Telugu	7	C	Room 107	2026-03-29 02:14:21.305842
6171	174	5	Monday	8	14:05	15:00	Telugu	7	C	Room 107	2026-03-29 02:14:21.305842
6172	174	5	Monday	11	16:05	17:00	Telugu	7	C	Room 107	2026-03-29 02:14:21.305842
6173	79	5	Tuesday	1	08:30	09:25	English	7	C	Room 107	2026-03-29 02:14:21.305842
6174	174	5	Tuesday	3	10:20	11:15	Telugu	7	C	Room 107	2026-03-29 02:14:21.305842
6175	108	5	Tuesday	5	11:30	12:25	Telugu	7	C	Room 107	2026-03-29 02:14:21.305842
6176	174	5	Tuesday	8	14:05	15:00	Telugu	7	C	Room 107	2026-03-29 02:14:21.305842
6177	79	5	Tuesday	9	15:00	15:55	English	7	C	Room 107	2026-03-29 02:14:21.305842
6178	174	5	Tuesday	11	16:05	17:00	Telugu	7	C	Room 107	2026-03-29 02:14:21.305842
6179	79	5	Wednesday	2	09:25	10:20	English	7	C	Room 107	2026-03-29 02:14:21.305842
6180	98	5	Wednesday	5	11:30	12:25	Hindi	7	C	Room 107	2026-03-29 02:14:21.305842
6181	79	5	Wednesday	11	16:05	17:00	English	7	C	Room 107	2026-03-29 02:14:21.305842
6182	79	5	Thursday	1	08:30	09:25	English	7	C	Room 107	2026-03-29 02:14:21.305842
6183	79	5	Thursday	5	11:30	12:25	English	7	C	Room 107	2026-03-29 02:14:21.305842
6184	98	5	Friday	5	11:30	12:25	Hindi	7	C	Room 107	2026-03-29 02:14:21.305842
6185	98	5	Friday	6	12:25	13:20	Hindi	7	C	Room 107	2026-03-29 02:14:21.305842
6186	94	5	Friday	8	14:05	15:00	Social Studies	7	C	Room 107	2026-03-29 02:14:21.305842
6187	94	5	Friday	9	15:00	15:55	Social Studies	7	C	Room 107	2026-03-29 02:14:21.305842
6188	91	5	Friday	11	16:05	17:00	Mathematics	7	C	Room 107	2026-03-29 02:14:21.305842
6189	94	5	Saturday	1	08:30	09:25	Social Studies	7	C	Room 107	2026-03-29 02:14:21.305842
6190	91	5	Saturday	2	09:25	10:20	Mathematics	7	C	Room 107	2026-03-29 02:14:21.305842
6191	97	5	Monday	1	08:30	09:25	English	8	A	Room 108	2026-03-29 02:14:21.305842
6192	90	5	Monday	2	09:25	10:20	Mathematics	8	A	Room 108	2026-03-29 02:14:21.305842
6193	95	5	Monday	3	10:20	11:15	Social Studies	8	A	Room 108	2026-03-29 02:14:21.305842
6194	97	5	Monday	5	11:30	12:25	English	8	A	Room 108	2026-03-29 02:14:21.305842
6195	90	5	Monday	6	12:25	13:20	Mathematics	8	A	Room 108	2026-03-29 02:14:21.305842
6196	86	5	Monday	8	14:05	15:00	dance	8	A	Room 108	2026-03-29 02:14:21.305842
6197	95	5	Monday	9	15:00	15:55	Social Studies	8	A	Room 108	2026-03-29 02:14:21.305842
6198	86	5	Monday	11	16:05	17:00	dance	8	A	Room 108	2026-03-29 02:14:21.305842
6199	97	5	Tuesday	1	08:30	09:25	English	8	A	Room 108	2026-03-29 02:14:21.305842
6200	90	5	Tuesday	2	09:25	10:20	Mathematics	8	A	Room 108	2026-03-29 02:14:21.305842
6201	95	5	Tuesday	3	10:20	11:15	Social Studies	8	A	Room 108	2026-03-29 02:14:21.305842
6202	174	5	Tuesday	5	11:30	12:25	Telugu	8	A	Room 108	2026-03-29 02:14:21.305842
6203	97	5	Tuesday	6	12:25	13:20	English	8	A	Room 108	2026-03-29 02:14:21.305842
6204	86	5	Tuesday	8	14:05	15:00	dance	8	A	Room 108	2026-03-29 02:14:21.305842
6205	90	5	Tuesday	9	15:00	15:55	Mathematics	8	A	Room 108	2026-03-29 02:14:21.305842
6206	86	5	Tuesday	11	16:05	17:00	dance	8	A	Room 108	2026-03-29 02:14:21.305842
6207	95	5	Wednesday	1	08:30	09:25	Social Studies	8	A	Room 108	2026-03-29 02:14:21.305842
6208	174	5	Wednesday	2	09:25	10:20	Telugu	8	A	Room 108	2026-03-29 02:14:21.305842
6209	97	5	Wednesday	3	10:20	11:15	English	8	A	Room 108	2026-03-29 02:14:21.305842
6210	174	5	Wednesday	5	11:30	12:25	Telugu	8	A	Room 108	2026-03-29 02:14:21.305842
6211	90	5	Wednesday	6	12:25	13:20	Mathematics	8	A	Room 108	2026-03-29 02:14:21.305842
6212	86	5	Wednesday	8	14:05	15:00	dance	8	A	Room 108	2026-03-29 02:14:21.305842
6213	95	5	Wednesday	9	15:00	15:55	Social Studies	8	A	Room 108	2026-03-29 02:14:21.305842
6214	86	5	Wednesday	11	16:05	17:00	dance	8	A	Room 108	2026-03-29 02:14:21.305842
6215	97	5	Thursday	1	08:30	09:25	English	8	A	Room 108	2026-03-29 02:14:21.305842
6216	108	5	Thursday	2	09:25	10:20	Telugu	8	A	Room 108	2026-03-29 02:14:21.305842
6217	90	5	Thursday	3	10:20	11:15	Mathematics	8	A	Room 108	2026-03-29 02:14:21.305842
6218	95	5	Thursday	5	11:30	12:25	Social Studies	8	A	Room 108	2026-03-29 02:14:21.305842
6219	174	5	Thursday	6	12:25	13:20	Telugu	8	A	Room 108	2026-03-29 02:14:21.305842
6220	108	5	Thursday	8	14:05	15:00	Telugu	8	A	Room 108	2026-03-29 02:14:21.305842
6221	98	5	Friday	8	14:05	15:00	Hindi	8	A	Room 108	2026-03-29 02:14:21.305842
6222	98	5	Friday	9	15:00	15:55	Hindi	8	A	Room 108	2026-03-29 02:14:21.305842
6223	98	5	Friday	11	16:05	17:00	Hindi	8	A	Room 108	2026-03-29 02:14:21.305842
6224	90	5	Monday	1	08:30	09:25	Mathematics	8	B	Room 108	2026-03-29 02:14:21.305842
6225	94	5	Monday	2	09:25	10:20	Social Studies	8	B	Room 108	2026-03-29 02:14:21.305842
6226	97	5	Monday	3	10:20	11:15	English	8	B	Room 108	2026-03-29 02:14:21.305842
6227	90	5	Monday	5	11:30	12:25	Mathematics	8	B	Room 108	2026-03-29 02:14:21.305842
6228	97	5	Monday	6	12:25	13:20	English	8	B	Room 108	2026-03-29 02:14:21.305842
6229	94	5	Monday	8	14:05	15:00	Social Studies	8	B	Room 108	2026-03-29 02:14:21.305842
6230	97	5	Monday	9	15:00	15:55	English	8	B	Room 108	2026-03-29 02:14:21.305842
6231	90	5	Monday	11	16:05	17:00	Mathematics	8	B	Room 108	2026-03-29 02:14:21.305842
6232	90	5	Tuesday	1	08:30	09:25	Mathematics	8	B	Room 108	2026-03-29 02:14:21.305842
6233	97	5	Tuesday	2	09:25	10:20	English	8	B	Room 108	2026-03-29 02:14:21.305842
6234	90	5	Tuesday	3	10:20	11:15	Mathematics	8	B	Room 108	2026-03-29 02:14:21.305842
6235	95	5	Tuesday	5	11:30	12:25	Social Studies	8	B	Room 108	2026-03-29 02:14:21.305842
6236	95	5	Tuesday	6	12:25	13:20	Social Studies	8	B	Room 108	2026-03-29 02:14:21.305842
6237	90	5	Tuesday	8	14:05	15:00	Mathematics	8	B	Room 108	2026-03-29 02:14:21.305842
6238	97	5	Tuesday	9	15:00	15:55	English	8	B	Room 108	2026-03-29 02:14:21.305842
6239	97	5	Tuesday	11	16:05	17:00	English	8	B	Room 108	2026-03-29 02:14:21.305842
6240	97	5	Wednesday	1	08:30	09:25	English	8	B	Room 108	2026-03-29 02:14:21.305842
6241	95	5	Wednesday	2	09:25	10:20	Social Studies	8	B	Room 108	2026-03-29 02:14:21.305842
6242	90	5	Wednesday	3	10:20	11:15	Mathematics	8	B	Room 108	2026-03-29 02:14:21.305842
6243	95	5	Wednesday	5	11:30	12:25	Social Studies	8	B	Room 108	2026-03-29 02:14:21.305842
6244	108	5	Wednesday	6	12:25	13:20	Telugu	8	B	Room 108	2026-03-29 02:14:21.305842
6245	174	5	Wednesday	9	15:00	15:55	Telugu	8	B	Room 108	2026-03-29 02:14:21.305842
6246	108	5	Wednesday	11	16:05	17:00	Telugu	8	B	Room 108	2026-03-29 02:14:21.305842
6247	174	5	Thursday	2	09:25	10:20	Telugu	8	B	Room 108	2026-03-29 02:14:21.305842
6248	108	5	Thursday	3	10:20	11:15	Telugu	8	B	Room 108	2026-03-29 02:14:21.305842
6249	174	5	Thursday	8	14:05	15:00	Telugu	8	B	Room 108	2026-03-29 02:14:21.305842
6250	108	5	Thursday	11	16:05	17:00	Telugu	8	B	Room 108	2026-03-29 02:14:21.305842
6251	98	5	Saturday	1	08:30	09:25	Hindi	8	B	Room 108	2026-03-29 02:14:21.305842
6252	98	5	Saturday	2	09:25	10:20	Hindi	8	B	Room 108	2026-03-29 02:14:21.305842
6253	174	5	Wednesday	6	12:25	13:20	Telugu	8	C	Room 108	2026-03-29 02:14:21.305842
6254	174	5	Wednesday	11	16:05	17:00	Telugu	8	C	Room 108	2026-03-29 02:14:21.305842
6255	174	5	Thursday	3	10:20	11:15	Telugu	8	C	Room 108	2026-03-29 02:14:21.305842
6256	79	5	Thursday	8	14:05	15:00	English	8	C	Room 108	2026-03-29 02:14:21.305842
6257	174	5	Thursday	11	16:05	17:00	Telugu	8	C	Room 108	2026-03-29 02:14:21.305842
6258	79	5	Friday	1	08:30	09:25	English	8	C	Room 108	2026-03-29 02:14:21.305842
6259	79	5	Friday	2	09:25	10:20	English	8	C	Room 108	2026-03-29 02:14:21.305842
6260	94	5	Saturday	3	10:20	11:15	Social Studies	8	C	Room 108	2026-03-29 02:14:21.305842
6261	98	5	Saturday	5	11:30	12:25	Hindi	8	C	Room 108	2026-03-29 02:14:21.305842
6262	91	5	Saturday	6	12:25	13:20	Mathematics	8	C	Room 108	2026-03-29 02:14:21.305842
6263	94	5	Saturday	8	14:05	15:00	Social Studies	8	C	Room 108	2026-03-29 02:14:21.305842
\.


--
-- Data for Name: user_profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_profiles (id, user_id, full_name, phone, designation, bio, updated_at) FROM stdin;
1	1	Kowsik	9014760259	Co-founder	ok	2026-03-21 22:34:51.986984
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, school_code, password_hash, role, school_id, first_login, profile_completed, created_at) FROM stdin;
1	kowsik@welearnyoulearn.com	\N	$2b$12$dYu.o0V48zNb8pHoGklR3.lnw4OI40KCRZYj3b5o.RPEwBLk1dI32	platform_admin	\N	f	t	2026-03-21 22:31:10.817327
3	sumanthchandrano2217@gmail.com	wlyl-schl-testschool1-7	$2b$12$DDYUvOf5k8nJqYnMvlpuIuzM5fwDE0JvNYshM2qSlO1jO14Nw14aO	school_admin	7	f	f	2026-03-21 22:44:34.287252
14	a@gmail.com	wlyl-schl-test-22	$2b$12$HKJRBqdXdcdTEGVXMINrFeEOWvCmXTQ9NOLzwIGg5FTctZsO1V60G	school_admin	22	t	f	2026-03-25 20:45:18.039471
\.


--
-- Data for Name: weekly_tests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.weekly_tests (id, school_id, class_id, student_id, week_start, questions, student_answers, score, max_score, status, generated_at, submitted_at) FROM stdin;
\.


--
-- Name: attendance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.attendance_id_seq', 47, true);


--
-- Name: class_subjects_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.class_subjects_id_seq', 660, true);


--
-- Name: class_timetable_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.class_timetable_id_seq', 20145, true);


--
-- Name: classes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.classes_id_seq', 97, true);


--
-- Name: curriculum_assignments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.curriculum_assignments_id_seq', 46, true);


--
-- Name: daily_newspapers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.daily_newspapers_id_seq', 2, true);


--
-- Name: doubt_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.doubt_messages_id_seq', 21, true);


--
-- Name: doubt_upvotes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.doubt_upvotes_id_seq', 9, true);


--
-- Name: doubts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.doubts_id_seq', 14, true);


--
-- Name: exam_marks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.exam_marks_id_seq', 8, true);


--
-- Name: exam_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.exam_records_id_seq', 2, true);


--
-- Name: exam_subjects_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.exam_subjects_id_seq', 9, true);


--
-- Name: leave_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.leave_requests_id_seq', 39, true);


--
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.notifications_id_seq', 318, true);


--
-- Name: parent_mark_acks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.parent_mark_acks_id_seq', 1, false);


--
-- Name: parents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.parents_id_seq', 50, true);


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.password_reset_tokens_id_seq', 1, false);


--
-- Name: school_schedule_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.school_schedule_settings_id_seq', 1, false);


--
-- Name: school_subscriptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.school_subscriptions_id_seq', 18, true);


--
-- Name: schools_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.schools_id_seq', 22, true);


--
-- Name: student_badges_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.student_badges_id_seq', 1, false);


--
-- Name: student_newspaper_reads_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.student_newspaper_reads_id_seq', 3, true);


--
-- Name: student_parents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.student_parents_id_seq', 50, true);


--
-- Name: student_points_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.student_points_id_seq', 5, true);


--
-- Name: students_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.students_id_seq', 86, true);


--
-- Name: substitute_assignments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.substitute_assignments_id_seq', 53, true);


--
-- Name: syllabus_topics_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.syllabus_topics_id_seq', 1, false);


--
-- Name: task_reminders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.task_reminders_id_seq', 1, false);


--
-- Name: task_submissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.task_submissions_id_seq', 2, true);


--
-- Name: tasks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tasks_id_seq', 5, true);


--
-- Name: teacher_unavailability_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.teacher_unavailability_id_seq', 12, true);


--
-- Name: teachers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.teachers_id_seq', 174, true);


--
-- Name: timetable_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.timetable_id_seq', 6263, true);


--
-- Name: user_profiles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_profiles_id_seq', 11, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 14, true);


--
-- Name: weekly_tests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.weekly_tests_id_seq', 1, false);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: class_subjects class_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_subjects
    ADD CONSTRAINT class_subjects_pkey PRIMARY KEY (id);


--
-- Name: class_timetable class_timetable_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_timetable
    ADD CONSTRAINT class_timetable_pkey PRIMARY KEY (id);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: classes classes_school_id_grade_section_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_school_id_grade_section_key UNIQUE (school_id, grade, section);


--
-- Name: curriculum_assignments curriculum_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_assignments
    ADD CONSTRAINT curriculum_assignments_pkey PRIMARY KEY (id);


--
-- Name: curriculum_assignments curriculum_assignments_school_id_grade_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_assignments
    ADD CONSTRAINT curriculum_assignments_school_id_grade_key UNIQUE (school_id, grade);


--
-- Name: daily_newspapers daily_newspapers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_newspapers
    ADD CONSTRAINT daily_newspapers_pkey PRIMARY KEY (id);


--
-- Name: daily_newspapers daily_newspapers_school_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_newspapers
    ADD CONSTRAINT daily_newspapers_school_id_date_key UNIQUE (school_id, date);


--
-- Name: doubt_messages doubt_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doubt_messages
    ADD CONSTRAINT doubt_messages_pkey PRIMARY KEY (id);


--
-- Name: doubt_upvotes doubt_upvotes_doubt_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doubt_upvotes
    ADD CONSTRAINT doubt_upvotes_doubt_id_student_id_key UNIQUE (doubt_id, student_id);


--
-- Name: doubt_upvotes doubt_upvotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doubt_upvotes
    ADD CONSTRAINT doubt_upvotes_pkey PRIMARY KEY (id);


--
-- Name: doubts doubts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doubts
    ADD CONSTRAINT doubts_pkey PRIMARY KEY (id);


--
-- Name: exam_marks exam_marks_exam_id_student_id_subject_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_marks
    ADD CONSTRAINT exam_marks_exam_id_student_id_subject_name_key UNIQUE (exam_id, student_id, subject_name);


--
-- Name: exam_marks exam_marks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_marks
    ADD CONSTRAINT exam_marks_pkey PRIMARY KEY (id);


--
-- Name: exam_records exam_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_records
    ADD CONSTRAINT exam_records_pkey PRIMARY KEY (id);


--
-- Name: exam_subjects exam_subjects_exam_id_subject_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_subjects
    ADD CONSTRAINT exam_subjects_exam_id_subject_name_key UNIQUE (exam_id, subject_name);


--
-- Name: exam_subjects exam_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_subjects
    ADD CONSTRAINT exam_subjects_pkey PRIMARY KEY (id);


--
-- Name: leave_requests leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: parent_mark_acks parent_mark_acks_exam_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_mark_acks
    ADD CONSTRAINT parent_mark_acks_exam_id_student_id_key UNIQUE (exam_id, student_id);


--
-- Name: parent_mark_acks parent_mark_acks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_mark_acks
    ADD CONSTRAINT parent_mark_acks_pkey PRIMARY KEY (id);


--
-- Name: parents parents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parents
    ADD CONSTRAINT parents_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_key UNIQUE (token);


--
-- Name: school_schedule_settings school_schedule_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_schedule_settings
    ADD CONSTRAINT school_schedule_settings_pkey PRIMARY KEY (id);


--
-- Name: school_schedule_settings school_schedule_settings_school_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_schedule_settings
    ADD CONSTRAINT school_schedule_settings_school_id_key UNIQUE (school_id);


--
-- Name: school_subscriptions school_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_subscriptions
    ADD CONSTRAINT school_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: school_subscriptions school_subscriptions_school_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_subscriptions
    ADD CONSTRAINT school_subscriptions_school_id_key UNIQUE (school_id);


--
-- Name: schools schools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_pkey PRIMARY KEY (id);


--
-- Name: schools schools_school_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_school_code_key UNIQUE (school_code);


--
-- Name: student_badges student_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_badges
    ADD CONSTRAINT student_badges_pkey PRIMARY KEY (id);


--
-- Name: student_badges student_badges_student_id_badge_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_badges
    ADD CONSTRAINT student_badges_student_id_badge_type_key UNIQUE (student_id, badge_type);


--
-- Name: student_newspaper_reads student_newspaper_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_newspaper_reads
    ADD CONSTRAINT student_newspaper_reads_pkey PRIMARY KEY (id);


--
-- Name: student_newspaper_reads student_newspaper_reads_student_id_newspaper_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_newspaper_reads
    ADD CONSTRAINT student_newspaper_reads_student_id_newspaper_id_key UNIQUE (student_id, newspaper_id);


--
-- Name: student_parents student_parents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_parents
    ADD CONSTRAINT student_parents_pkey PRIMARY KEY (id);


--
-- Name: student_parents student_parents_student_id_parent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_parents
    ADD CONSTRAINT student_parents_student_id_parent_id_key UNIQUE (student_id, parent_id);


--
-- Name: student_points student_points_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_points
    ADD CONSTRAINT student_points_pkey PRIMARY KEY (id);


--
-- Name: student_streaks student_streaks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_streaks
    ADD CONSTRAINT student_streaks_pkey PRIMARY KEY (student_id);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: substitute_assignments substitute_assignments_class_id_date_period_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.substitute_assignments
    ADD CONSTRAINT substitute_assignments_class_id_date_period_number_key UNIQUE (class_id, date, period_number);


--
-- Name: substitute_assignments substitute_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.substitute_assignments
    ADD CONSTRAINT substitute_assignments_pkey PRIMARY KEY (id);


--
-- Name: syllabus_topics syllabus_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus_topics
    ADD CONSTRAINT syllabus_topics_pkey PRIMARY KEY (id);


--
-- Name: task_reminders task_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_reminders
    ADD CONSTRAINT task_reminders_pkey PRIMARY KEY (id);


--
-- Name: task_submissions task_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_submissions
    ADD CONSTRAINT task_submissions_pkey PRIMARY KEY (id);


--
-- Name: task_submissions task_submissions_task_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_submissions
    ADD CONSTRAINT task_submissions_task_id_student_id_key UNIQUE (task_id, student_id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: teacher_unavailability teacher_unavailability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_unavailability
    ADD CONSTRAINT teacher_unavailability_pkey PRIMARY KEY (id);


--
-- Name: teacher_unavailability teacher_unavailability_teacher_id_day_of_week_period_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_unavailability
    ADD CONSTRAINT teacher_unavailability_teacher_id_day_of_week_period_number_key UNIQUE (teacher_id, day_of_week, period_number);


--
-- Name: teachers teachers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_pkey PRIMARY KEY (id);


--
-- Name: timetable timetable_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable
    ADD CONSTRAINT timetable_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_key UNIQUE (user_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_school_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_school_code_key UNIQUE (school_code);


--
-- Name: weekly_tests weekly_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_tests
    ADD CONSTRAINT weekly_tests_pkey PRIMARY KEY (id);


--
-- Name: weekly_tests weekly_tests_student_id_week_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_tests
    ADD CONSTRAINT weekly_tests_student_id_week_start_key UNIQUE (student_id, week_start);


--
-- Name: attendance_session_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX attendance_session_unique ON public.attendance USING btree (student_id, date, class_id, session);


--
-- Name: class_subjects_class_subject_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX class_subjects_class_subject_key ON public.class_subjects USING btree (class_id, subject_name);


--
-- Name: idx_class_timetable_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_class_timetable_slot ON public.class_timetable USING btree (class_id, day_of_week, period_number);


--
-- Name: idx_doubt_messages_doubt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doubt_messages_doubt ON public.doubt_messages USING btree (doubt_id, created_at);


--
-- Name: idx_doubt_upvotes_doubt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doubt_upvotes_doubt ON public.doubt_upvotes USING btree (doubt_id);


--
-- Name: idx_doubts_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doubts_class ON public.doubts USING btree (class_id, school_id);


--
-- Name: idx_doubts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doubts_status ON public.doubts USING btree (status, school_id);


--
-- Name: idx_doubts_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doubts_student ON public.doubts USING btree (student_id);


--
-- Name: idx_exam_marks_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_marks_student ON public.exam_marks USING btree (student_id, exam_id);


--
-- Name: idx_exam_records_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_records_class ON public.exam_records USING btree (class_id, school_id);


--
-- Name: idx_newspaper_reads_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_newspaper_reads_student ON public.student_newspaper_reads USING btree (student_id);


--
-- Name: idx_newspapers_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_newspapers_date ON public.daily_newspapers USING btree (school_id, date);


--
-- Name: idx_student_badges_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_badges_student ON public.student_badges USING btree (student_id);


--
-- Name: idx_student_points_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_points_student ON public.student_points USING btree (student_id, school_id);


--
-- Name: idx_syllabus_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_syllabus_class ON public.syllabus_topics USING btree (class_id, school_id);


--
-- Name: idx_syllabus_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_syllabus_subject ON public.syllabus_topics USING btree (class_id, subject);


--
-- Name: idx_task_reminders_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_reminders_task ON public.task_reminders USING btree (task_id);


--
-- Name: idx_task_subs_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_subs_student ON public.task_submissions USING btree (student_id);


--
-- Name: idx_task_subs_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_subs_task ON public.task_submissions USING btree (task_id);


--
-- Name: idx_tasks_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_class ON public.tasks USING btree (class_id);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status, due_date);


--
-- Name: idx_tasks_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_teacher ON public.tasks USING btree (teacher_id);


--
-- Name: idx_teacher_unavail_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_teacher_unavail_school ON public.teacher_unavailability USING btree (school_id, teacher_id);


--
-- Name: idx_teachers_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_teachers_employee_id ON public.teachers USING btree (employee_id, school_id);


--
-- Name: idx_timetable_teacher_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_timetable_teacher_slot ON public.timetable USING btree (teacher_id, school_id, day_of_week, period_number);


--
-- Name: idx_weekly_tests_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_tests_class ON public.weekly_tests USING btree (class_id, week_start);


--
-- Name: idx_weekly_tests_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_tests_student ON public.weekly_tests USING btree (student_id, week_start);


--
-- Name: users_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_unique ON public.users USING btree (email) WHERE (email IS NOT NULL);


--
-- Name: attendance attendance_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_marked_by_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_marked_by_teacher_id_fkey FOREIGN KEY (marked_by_teacher_id) REFERENCES public.teachers(id);


--
-- Name: attendance attendance_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: class_subjects class_subjects_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_subjects
    ADD CONSTRAINT class_subjects_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_subjects class_subjects_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_subjects
    ADD CONSTRAINT class_subjects_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: class_timetable class_timetable_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_timetable
    ADD CONSTRAINT class_timetable_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_timetable class_timetable_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_timetable
    ADD CONSTRAINT class_timetable_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: class_timetable class_timetable_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_timetable
    ADD CONSTRAINT class_timetable_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: classes classes_class_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_class_teacher_id_fkey FOREIGN KEY (class_teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: classes classes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: curriculum_assignments curriculum_assignments_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_assignments
    ADD CONSTRAINT curriculum_assignments_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: daily_newspapers daily_newspapers_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_newspapers
    ADD CONSTRAINT daily_newspapers_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: doubt_messages doubt_messages_doubt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doubt_messages
    ADD CONSTRAINT doubt_messages_doubt_id_fkey FOREIGN KEY (doubt_id) REFERENCES public.doubts(id) ON DELETE CASCADE;


--
-- Name: doubt_upvotes doubt_upvotes_doubt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doubt_upvotes
    ADD CONSTRAINT doubt_upvotes_doubt_id_fkey FOREIGN KEY (doubt_id) REFERENCES public.doubts(id) ON DELETE CASCADE;


--
-- Name: doubt_upvotes doubt_upvotes_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doubt_upvotes
    ADD CONSTRAINT doubt_upvotes_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: doubts doubts_answered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doubts
    ADD CONSTRAINT doubts_answered_by_fkey FOREIGN KEY (answered_by) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: doubts doubts_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doubts
    ADD CONSTRAINT doubts_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: doubts doubts_faq_set_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doubts
    ADD CONSTRAINT doubts_faq_set_by_fkey FOREIGN KEY (faq_set_by) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: doubts doubts_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doubts
    ADD CONSTRAINT doubts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: doubts doubts_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doubts
    ADD CONSTRAINT doubts_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: doubts doubts_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doubts
    ADD CONSTRAINT doubts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: doubts doubts_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doubts
    ADD CONSTRAINT doubts_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: exam_marks exam_marks_entered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_marks
    ADD CONSTRAINT exam_marks_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES public.teachers(id);


--
-- Name: exam_marks exam_marks_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_marks
    ADD CONSTRAINT exam_marks_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exam_records(id) ON DELETE CASCADE;


--
-- Name: exam_marks exam_marks_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_marks
    ADD CONSTRAINT exam_marks_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: exam_records exam_records_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_records
    ADD CONSTRAINT exam_records_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: exam_records exam_records_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_records
    ADD CONSTRAINT exam_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.teachers(id);


--
-- Name: exam_records exam_records_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_records
    ADD CONSTRAINT exam_records_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: exam_subjects exam_subjects_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_subjects
    ADD CONSTRAINT exam_subjects_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exam_records(id) ON DELETE CASCADE;


--
-- Name: exam_subjects exam_subjects_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_subjects
    ADD CONSTRAINT exam_subjects_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: exam_subjects exam_subjects_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_subjects
    ADD CONSTRAINT exam_subjects_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: leave_requests leave_requests_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: leave_requests leave_requests_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_recipient_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_school_id_fkey FOREIGN KEY (recipient_school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_recipient_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_student_id_fkey FOREIGN KEY (recipient_student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_recipient_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_teacher_id_fkey FOREIGN KEY (recipient_teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_sender_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_sender_teacher_id_fkey FOREIGN KEY (sender_teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: parent_mark_acks parent_mark_acks_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_mark_acks
    ADD CONSTRAINT parent_mark_acks_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exam_records(id) ON DELETE CASCADE;


--
-- Name: parent_mark_acks parent_mark_acks_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_mark_acks
    ADD CONSTRAINT parent_mark_acks_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: parents parents_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parents
    ADD CONSTRAINT parents_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: school_schedule_settings school_schedule_settings_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_schedule_settings
    ADD CONSTRAINT school_schedule_settings_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: school_subscriptions school_subscriptions_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_subscriptions
    ADD CONSTRAINT school_subscriptions_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: student_badges student_badges_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_badges
    ADD CONSTRAINT student_badges_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_newspaper_reads student_newspaper_reads_newspaper_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_newspaper_reads
    ADD CONSTRAINT student_newspaper_reads_newspaper_id_fkey FOREIGN KEY (newspaper_id) REFERENCES public.daily_newspapers(id) ON DELETE CASCADE;


--
-- Name: student_newspaper_reads student_newspaper_reads_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_newspaper_reads
    ADD CONSTRAINT student_newspaper_reads_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_parents student_parents_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_parents
    ADD CONSTRAINT student_parents_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.parents(id) ON DELETE CASCADE;


--
-- Name: student_parents student_parents_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_parents
    ADD CONSTRAINT student_parents_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_points student_points_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_points
    ADD CONSTRAINT student_points_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_streaks student_streaks_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_streaks
    ADD CONSTRAINT student_streaks_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: students students_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: substitute_assignments substitute_assignments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.substitute_assignments
    ADD CONSTRAINT substitute_assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: substitute_assignments substitute_assignments_leave_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.substitute_assignments
    ADD CONSTRAINT substitute_assignments_leave_request_id_fkey FOREIGN KEY (leave_request_id) REFERENCES public.leave_requests(id) ON DELETE CASCADE;


--
-- Name: substitute_assignments substitute_assignments_original_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.substitute_assignments
    ADD CONSTRAINT substitute_assignments_original_teacher_id_fkey FOREIGN KEY (original_teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: substitute_assignments substitute_assignments_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.substitute_assignments
    ADD CONSTRAINT substitute_assignments_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: substitute_assignments substitute_assignments_substitute_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.substitute_assignments
    ADD CONSTRAINT substitute_assignments_substitute_teacher_id_fkey FOREIGN KEY (substitute_teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: syllabus_topics syllabus_topics_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus_topics
    ADD CONSTRAINT syllabus_topics_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: syllabus_topics syllabus_topics_covered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus_topics
    ADD CONSTRAINT syllabus_topics_covered_by_fkey FOREIGN KEY (covered_by) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: syllabus_topics syllabus_topics_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.syllabus_topics
    ADD CONSTRAINT syllabus_topics_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: task_reminders task_reminders_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_reminders
    ADD CONSTRAINT task_reminders_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: task_reminders task_reminders_sent_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_reminders
    ADD CONSTRAINT task_reminders_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES public.teachers(id);


--
-- Name: task_reminders task_reminders_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_reminders
    ADD CONSTRAINT task_reminders_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_submissions task_submissions_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_submissions
    ADD CONSTRAINT task_submissions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.teachers(id);


--
-- Name: task_submissions task_submissions_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_submissions
    ADD CONSTRAINT task_submissions_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: task_submissions task_submissions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_submissions
    ADD CONSTRAINT task_submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: task_submissions task_submissions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_submissions
    ADD CONSTRAINT task_submissions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: teacher_unavailability teacher_unavailability_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_unavailability
    ADD CONSTRAINT teacher_unavailability_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: teacher_unavailability teacher_unavailability_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_unavailability
    ADD CONSTRAINT teacher_unavailability_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: teachers teachers_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: timetable timetable_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable
    ADD CONSTRAINT timetable_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: timetable timetable_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable
    ADD CONSTRAINT timetable_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: user_profiles user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: weekly_tests weekly_tests_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_tests
    ADD CONSTRAINT weekly_tests_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: weekly_tests weekly_tests_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_tests
    ADD CONSTRAINT weekly_tests_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: weekly_tests weekly_tests_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_tests
    ADD CONSTRAINT weekly_tests_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

