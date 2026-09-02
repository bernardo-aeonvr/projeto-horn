-- ============================================================================
-- SEED DE DESENVOLVIMENTO — empresa e cargo dos profissionais semeados
--
-- Preenche `company` e `job_role` (migrations 0015 e 0016) nos profissionais
-- que o dev_seed criou, e registra os valores usados em
-- `public.professional_options` para que apareçam nos seletores e nos filtros.
--
-- NÃO representa profissionais, escritórios ou negócios reais da HORN.
-- Remover a qualquer momento:
--
--   update public.professionals set company = null, job_role = null
--    where notes = 'seed';
--   delete from public.professional_options
--    where name in ('Aliás Arquitetura','Estúdio Vertente',
--                   'Oficina Térrea Arquitetura','Casa Rasa Arquitetura',
--                   'Ateliê Cota Zero','Interna Design de Interiores',
--                   'Duo Interiores','Peixoto Engenharia',
--                   'Construtora Vale Sul','Sanches Projetos e Obras',
--                   'Imobiliária Prazeres');
--
-- POR QUE UM ARQUIVO NOVO, E NÃO UMA EDIÇÃO DO dev_seed
--
-- O dev_seed insere e para na primeira barreira: `where not exists (... name)`.
-- Numa base que já tem os 65 profissionais dele, acrescentar duas colunas
-- àquele INSERT não mudaria uma linha sequer. Aqui o trabalho é UPDATE, que é
-- outra operação — e que continua valendo depois de um dev_seed novo, sem
-- duplicar o mapa de nomes em dois arquivos.
--
-- O QUE ELE NÃO TOCA
--
-- `notes = 'seed'` recorta o alvo: é a marca que o dev_seed deixa. A carteira
-- do outro administrador não tem essa marca e fica inteira fora daqui, assim
-- como o registro de QA e qualquer profissional cadastrado pela tela.
--
-- E, dentro do próprio seed, só entra quem está com os DOIS campos vazios:
-- quem já tem empresa ou cargo foi preenchido por alguém, na tela, e continua
-- como está. É o que torna o arquivo seguro de reaplicar.
--
-- COMO OS DADOS FORAM DISTRIBUÍDOS
--
-- Onze escritórios, de dois a seis profissionais cada, porque o ponto do campo
-- é justamente reunir gente do mesmo lugar: filtrar por "Aliás Arquitetura"
-- precisa devolver mais de uma pessoa para provar alguma coisa. Um deles tem
-- uma profissional inativa, para o cruzamento empresa + status ter resultado.
--
-- Cerca de metade da base fica SEM empresa, de propósito: autônomo é a
-- situação normal de boa parte da carteira, e é o caminho que mostra o "—" na
-- listagem. Uma profissional fica com cargo e sem empresa — existe, e é o
-- único jeito de exercitar esse desenho na ficha.
--
-- Os cargos ficam no masculino ("Sócio", "Coordenador") por serem uma LISTA
-- compartilhada: "Sócio" e "Sócia" seriam duas opções para a mesma coisa, e o
-- seletor encheria de variação.
--
-- Idempotente: reaplicar não muda nada nem duplica opção.
--
-- Pré-requisitos: dev_seed.sql aplicado, migrations 0015 e 0016 aplicadas.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. EMPRESA E CARGO
-- --------------------------------------------------------------------------
-- O dono é o mesmo critério do dev_seed — o admin mais antigo, dono das linhas
-- semeadas. Junto com `notes = 'seed'`, garante que nada fora do conjunto
-- fictício seja alcançado.

with dados(nome, empresa, cargo) as (
  values
    -- Aliás Arquitetura — o escritório dos exemplos da especificação
    ('Ana Carolina Marques',      'Aliás Arquitetura',            'Sócio'),
    ('Juliana Sampaio Bruno',     'Aliás Arquitetura',            'Sócio'),
    ('Beatriz Almeida Nunes',     'Aliás Arquitetura',            'Equipe'),
    ('Natália Siqueira Rangel',   'Aliás Arquitetura',            'Equipe'),
    ('Heloísa Barroso Campos',    'Aliás Arquitetura',            'Coordenador'),
    -- inativa de propósito: empresa + status precisa ter o que mostrar
    ('Adriana Peçanha Rios',      'Aliás Arquitetura',            'Equipe'),

    ('Fernanda Bueno Castro',     'Estúdio Vertente',             'Sócio'),
    ('Ursula Kramer Antunes',     'Estúdio Vertente',             'Diretor'),
    ('Karina Lessa Moreira',      'Estúdio Vertente',             'Equipe'),
    ('Letícia Chaves Fontoura',   'Estúdio Vertente',             'Equipe'),

    ('Camila Ferreira Rocha',     'Oficina Térrea Arquitetura',   'Sócio'),
    ('Daniela Prado Vasques',     'Oficina Térrea Arquitetura',   'Equipe'),
    ('Flávia Bragança Melo',      'Oficina Térrea Arquitetura',   'Equipe'),

    ('Elaine Modesto Vieira',     'Casa Rasa Arquitetura',        'Sócio'),
    ('Ingrid Yamamoto Lisboa',    'Casa Rasa Arquitetura',        'Equipe'),
    ('Patrícia Rangel Coutinho',  'Casa Rasa Arquitetura',        'Equipe'),

    ('Amanda Werneck Toledo',     'Ateliê Cota Zero',             'Sócio'),
    ('Gisele Bertazzi Rufino',    'Ateliê Cota Zero',             'Designer'),
    ('Bianca Ramalho Serra',      'Ateliê Cota Zero',             'Equipe'),
    ('Estela Quirino Bezerra',    'Ateliê Cota Zero',             'Equipe'),

    ('Iara Bonatto Meireles',     'Interna Design de Interiores', 'Sócio'),
    ('Michele Krause Vilela',     'Interna Design de Interiores', 'Equipe'),
    ('Nádia Ferraz Coelho',       'Interna Design de Interiores', 'Equipe'),

    ('Carolina Bellini Duarte',   'Duo Interiores',               'Sócio'),
    ('Kelly Nakamura Braz',       'Duo Interiores',               'Equipe'),

    ('Anderson Lima Peixoto',     'Peixoto Engenharia',           'Sócio'),
    ('Diego Fontoura Milani',     'Peixoto Engenharia',           'Equipe'),
    ('Henrique Modesto Vargas',   'Peixoto Engenharia',           'Equipe'),

    ('Bruno Salgado Teixeira',    'Construtora Vale Sul',         'Sócio'),
    ('Emerson Pontes Barros',     'Construtora Vale Sul',         'Gerente'),
    ('Caio Bertaso Nogueira',     'Construtora Vale Sul',         'Equipe'),

    ('Carlos Eduardo Sanches',    'Sanches Projetos e Obras',     'Proprietário'),
    ('Gustavo Ribas Portugal',    'Sanches Projetos e Obras',     'Equipe'),

    ('Leandro Prazeres Coutinho', 'Imobiliária Prazeres',         'Proprietário'),
    ('Marcos Tavares Brandão',    'Imobiliária Prazeres',         'Comercial'),

    -- Cargo sem empresa: a arquiteta que atende por conta própria. Os dois
    -- campos são independentes, e a ficha precisa aguentar essa combinação.
    ('Olívia Tanaka Ferraz',      null,                           'Proprietário')
)
update public.professionals p
   set company = d.empresa,
       job_role = d.cargo
  from dados d
 where p.name = d.nome
   and p.notes = 'seed'
   and p.owner_id = (select up.id
                       from public.user_profiles up
                      where up.role = 'admin'::public.app_role
                        and up.owner_id = up.id
                      order by up.created_at
                      limit 1)
   -- Não reescreve o que já foi preenchido pela tela.
   and p.company is null
   and p.job_role is null;

-- --------------------------------------------------------------------------
-- 2. O CATÁLOGO
-- --------------------------------------------------------------------------
-- Um UPDATE direto não passa pela `save_professional`, que é quem normalmente
-- registra o valor usado. Sem estas duas inserções, os profissionais acima
-- apareceriam na listagem mas os seletores e os filtros não ofereceriam as
-- empresas — o mesmo cuidado que a migration 0016 tomou com o histórico.
--
-- Mesma normalização do índice único: `lower(btrim(name))`.

insert into public.professional_options (owner_id, kind, name)
select distinct on (p.owner_id, lower(btrim(p.company)))
       p.owner_id,
       'company'::public.professional_option_kind,
       btrim(p.company)
  from public.professionals p
 where p.notes = 'seed'
   and p.company is not null
   and btrim(p.company) <> ''
 order by p.owner_id, lower(btrim(p.company)), p.created_at
on conflict do nothing;

insert into public.professional_options (owner_id, kind, name)
select distinct on (p.owner_id, lower(btrim(p.job_role)))
       p.owner_id,
       'job_role'::public.professional_option_kind,
       btrim(p.job_role)
  from public.professionals p
 where p.notes = 'seed'
   and p.job_role is not null
   and btrim(p.job_role) <> ''
 order by p.owner_id, lower(btrim(p.job_role)), p.created_at
on conflict do nothing;

commit;
