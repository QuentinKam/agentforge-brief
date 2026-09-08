-- 启用 pgvector 扩展（已存在则跳过）
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "rag_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"metadata_json" jsonb DEFAULT '{}'::jsonb,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rag_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"file_name" varchar(500) NOT NULL,
	"file_type" varchar(50) NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rag_chunks" ADD CONSTRAINT "rag_chunks_document_id_rag_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."rag_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_chunks" ADD CONSTRAINT "rag_chunks_agent_id_agent_projects_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_documents" ADD CONSTRAINT "rag_documents_agent_id_agent_projects_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_projects"("id") ON DELETE cascade ON UPDATE no action;