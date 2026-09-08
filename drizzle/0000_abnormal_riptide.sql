CREATE TYPE "public"."run_status" AS ENUM('pending', 'running', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."run_step_type" AS ENUM('llm_call', 'tool_call', 'rag_retrieval');--> statement-breakpoint
CREATE TABLE "agent_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"provider" varchar(50) DEFAULT 'openai' NOT NULL,
	"model" varchar(100) DEFAULT 'gpt-4o-mini' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"step_type" "run_step_type" NOT NULL,
	"step_input" jsonb,
	"step_output" jsonb,
	"duration_ms" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"input" text NOT NULL,
	"output" text,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"token_count" integer DEFAULT 0,
	"duration_ms" integer DEFAULT 0,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"name" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "agent_projects" ADD CONSTRAINT "agent_projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_steps" ADD CONSTRAINT "agent_run_steps_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_agent_projects_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;