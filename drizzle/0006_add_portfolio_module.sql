CREATE TYPE "public"."portfolio_project_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "portfolio_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "portfolio_project_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_project_technologies" (
	"project_id" uuid NOT NULL,
	"technology_id" uuid NOT NULL,
	CONSTRAINT "portfolio_project_technologies_project_id_technology_id_pk" PRIMARY KEY("project_id","technology_id")
);
--> statement-breakpoint
CREATE TABLE "portfolio_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"short_description" text NOT NULL,
	"about_description" text,
	"category_id" uuid,
	"main_image_key" text,
	"website_url" text,
	"is_live" boolean DEFAULT false NOT NULL,
	"status" "portfolio_project_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "portfolio_technologies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "portfolio_categories" ADD CONSTRAINT "portfolio_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_project_images" ADD CONSTRAINT "portfolio_project_images_project_id_portfolio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."portfolio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_project_technologies" ADD CONSTRAINT "portfolio_project_technologies_project_id_portfolio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."portfolio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_project_technologies" ADD CONSTRAINT "portfolio_project_technologies_technology_id_portfolio_technologies_id_fk" FOREIGN KEY ("technology_id") REFERENCES "public"."portfolio_technologies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_projects" ADD CONSTRAINT "portfolio_projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_projects" ADD CONSTRAINT "portfolio_projects_category_id_portfolio_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."portfolio_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_technologies" ADD CONSTRAINT "portfolio_technologies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_categories_slug_unique" ON "portfolio_categories" USING btree ("company_id","slug") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "portfolio_categories_company_id_idx" ON "portfolio_categories" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "portfolio_project_images_project_id_idx" ON "portfolio_project_images" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "portfolio_project_technologies_technology_id_idx" ON "portfolio_project_technologies" USING btree ("technology_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_projects_slug_unique" ON "portfolio_projects" USING btree ("company_id","slug") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "portfolio_projects_company_id_idx" ON "portfolio_projects" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "portfolio_projects_category_id_idx" ON "portfolio_projects" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "portfolio_projects_status_idx" ON "portfolio_projects" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_technologies_slug_unique" ON "portfolio_technologies" USING btree ("company_id","slug") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "portfolio_technologies_company_id_idx" ON "portfolio_technologies" USING btree ("company_id");