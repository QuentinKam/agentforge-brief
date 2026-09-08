CREATE TABLE "harness_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"system_prompt" text,
	"rules_json" jsonb DEFAULT '[]'::jsonb,
	"constraints_json" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"trigger_json" jsonb DEFAULT '{}'::jsonb,
	"tool_chain_json" jsonb DEFAULT '[]'::jsonb,
	"input_schema" jsonb,
	"output_schema" jsonb,
	"is_template" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "harness_configs" ADD CONSTRAINT "harness_configs_agent_id_agent_projects_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_agent_id_agent_projects_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_projects"("id") ON DELETE cascade ON UPDATE no action;