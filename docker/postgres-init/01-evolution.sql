-- Banco próprio do Evolution API (perfil "whatsapp" do docker-compose.yml)
-- — nunca compartilha schema com o projeto_prisma da API.
--
-- Scripts em /docker-entrypoint-initdb.d só rodam na criação de um volume
-- NOVO do Postgres. Se `prisma_postgres_data` já existir de antes desta
-- mudança, criar o banco é manual, uma vez só:
--   docker compose exec postgres psql -U prisma -c "CREATE DATABASE evolution"
CREATE DATABASE evolution;
