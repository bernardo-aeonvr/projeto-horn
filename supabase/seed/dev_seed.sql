-- ============================================================================
-- SEED DE DESENVOLVIMENTO — dados fictícios
--
-- Popula lojas e profissionais para exercitar as telas com volume realista.
-- NÃO representa clientes reais da HORN. Remover antes de entrar em operação:
--
--   delete from public.professionals where notes = 'seed';
--   delete from public.stores where notes = 'seed';
--
-- (os vínculos em professional_regions saem junto, por ON DELETE CASCADE)
--
-- O arquivo é idempotente: reaplicar não duplica registros, porque cada
-- inserção verifica o nome antes.
--
-- A distribuição imita a base real descrita na especificação (seção 20.2):
-- maioria de arquitetos, muitos cadastros incompletos, região ausente em
-- boa parte dos registros.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- DONO DOS DADOS SEMEADOS
-- --------------------------------------------------------------------------
-- Desde a migration 0009 cada linha tem um admin dono, e o trigger que
-- preencheria `owner_id` sozinho o deriva da sessão — que não existe aqui: o
-- seed roda no SQL Editor, sem `auth.uid()`. Sem a coluna preenchida à mão, o
-- insert para com "Sem perfil ativo para determinar o dono do registro".
--
-- O dono escolhido é o admin mais antigo. Para semear a base de outro
-- administrador, troque a subconsulta pelo UUID dele.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- LOJAS
-- --------------------------------------------------------------------------
with dados(nome, categoria, responsavel, telefone, ativa, mensal, comissao, inicio) as (
  values
    ('Navona Mármores',              'Mármores e granitos',   'Ricardo Alves',      '(11) 3814-2200', true,  1600.00, 3.00, date '2025-03-10'),
    ('Marmoraria São Bento',         'Mármores e granitos',   'Cláudia Nunes',      '(11) 3567-8890', true,  1200.00, 2.50, date '2025-05-22'),
    ('Pedra Viva Granitos',          'Mármores e granitos',   'Anderson Lima',      '(11) 2894-3311', true,     null, 4.00, date '2025-08-01'),
    ('Atelier Marcenaria Fina',      'Marcenaria',            'Juliana Prado',      '(11) 97766-3344', true,    null, 4.50, date '2025-06-12'),
    ('Marcenaria Bertolini',         'Marcenaria',            'Paulo Bertolini',    '(11) 4412-7788', true,  2200.00, 3.50, date '2024-11-05'),
    ('Woodline Ambientes',           'Marcenaria',            'Sérgio Kimura',      '(11) 3255-1190', true,  1800.00, 3.00, date '2025-01-19'),
    ('Madeira & Forma',              'Marcenaria',            'Renata Aguiar',      '(11) 3771-0455', false,  900.00, 2.00, date '2024-07-30'),
    ('Iluminare Projetos',           'Iluminação',            'Fernanda Bueno',     '(11) 3062-4477', true,  2500.50, 3.00, date '2025-02-14'),
    ('Lumina Design',                'Iluminação',            'Tiago Moretti',      '(11) 3849-6620', true,     null, 5.00, date '2025-09-08'),
    ('Studio Luz Ambiente',          'Iluminação',            'Beatriz Salgado',    '(11) 2578-9903', true,  1400.00, 3.00, date '2025-04-03'),
    ('Vidraçaria Cristal Sul',       'Vidros e esquadrias',   'Marcos Tavares',     '(11) 3344-5566', false,  900.00, 2.50, date '2024-09-17'),
    ('Esquadrias Alumitec',          'Vidros e esquadrias',   'Hélio Barbosa',      '(11) 4655-2201', true,  1750.00, 3.00, date '2025-03-28'),
    ('Glass House Vidros',           'Vidros e esquadrias',   'Simone Ferraz',      '(11) 2201-8834', true,     null, 4.00, date '2025-07-11'),
    ('Revestir Porcelanatos',        'Revestimentos',         'Otávio Camargo',     '(11) 3928-4410', true,  2000.00, 3.50, date '2024-12-02'),
    ('Casa Cerâmica',                'Revestimentos',         'Larissa Fontes',     '(11) 3567-2288', true,  1100.00, 2.50, date '2025-05-06'),
    ('Mosaico Nobre',                'Revestimentos',         'Eduardo Peixoto',    '(11) 2233-7719', true,     null, 4.50, date '2025-10-20'),
    ('Planejados Duomo',             'Móveis planejados',     'Cristina Vasques',   '(11) 4004-3390', true,  2800.00, 3.00, date '2024-08-14'),
    ('Ambiente Certo Planejados',    'Móveis planejados',     'Rodrigo Sampaio',    '(11) 3712-9945', true,  1900.00, 3.50, date '2025-01-27'),
    ('Concept Móveis',               'Móveis planejados',     'Vanessa Toledo',     '(11) 3388-1102', false,    null, 3.00, date '2024-06-09'),
    ('Piso Nobre Madeiras',          'Pisos e madeiras',      'Gustavo Ribas',      '(11) 2966-5540', true,  1300.00, 3.00, date '2025-02-25'),
    ('Assoalhos Guarani',            'Pisos e madeiras',      'Márcia Del Nero',    '(11) 3455-6677', true,     null, 4.00, date '2025-06-30'),
    ('Metais Deca Prime',            'Metais e louças',       'Alexandre Duarte',   '(11) 3199-8802', true,  2400.00, 2.50, date '2024-10-11'),
    ('Louças & Cia',                 'Metais e louças',       'Patrícia Rangel',    '(11) 2745-3318', true,  1000.00, 3.00, date '2025-04-16'),
    ('Banho Nobre',                  'Metais e louças',       'Diego Fontoura',     '(11) 3620-4471', true,     null, 3.50, date '2025-08-22'),
    ('Smart Home Automação',         'Automação residencial', 'Leandro Prazeres',   '(11) 4118-9020', true,  3200.00, 4.00, date '2025-01-08'),
    ('Domótica SP',                  'Automação residencial', 'Isabela Craveiro',   '(11) 3877-2214', true,     null, 5.00, date '2025-09-15'),
    ('Cortinas Bella Casa',          'Cortinas e persianas',  'Rosana Yamamoto',    '(11) 2588-6631', true,   850.00, 3.00, date '2025-03-05'),
    ('Persianas Brasil',             'Cortinas e persianas',  'Wagner Coutinho',    '(11) 3466-7712', false,    null, 2.50, date '2024-05-19'),
    ('Verde Vivo Paisagismo',        'Paisagismo',            'Camila Bragança',    '(11) 3021-4488', true,  1500.00, 3.50, date '2025-07-01'),
    ('Jardins do Sul',               'Paisagismo',            'Newton Sarmento',    '(11) 2799-1163', true,     null, 4.00, date '2025-10-03'),
    ('Clima Ideal Ar Condicionado',  'Climatização',          'Roberto Tanaka',     '(11) 4433-2091', true,  1700.00, 3.00, date '2024-11-26'),
    ('Frio Norte Climatização',      'Climatização',          'Adriana Peçanha',    '(11) 2911-5507', true,   950.00, 2.50, date '2025-05-13'),
    ('Cores & Texturas Tintas',      'Tintas e acabamentos',  'Fábio Werneck',      '(11) 3644-8829', true,     null, 3.00, date '2025-02-07'),
    ('Acabamento Premium',           'Tintas e acabamentos',  'Silvana Marroni',    '(11) 2350-9914', true,  1150.00, 3.50, date '2025-06-18'),
    ('Portas Imperial',              'Portas e portões',      'Nelson Carvalhaes',  '(11) 4577-3306', true,  1250.00, 3.00, date '2024-09-04'),
    ('Portões Vega',                 'Portas e portões',      'Elaine Modesto',     '(11) 3288-4470', false,    null, 3.00, date '2024-04-21'),
    ('Granito Real',                 'Mármores e granitos',   'Vitor Hugo Assis',   '(11) 2644-1128', true,  1350.00, 3.00, date '2025-04-29'),
    ('Quartzo Design',               'Mármores e granitos',   'Tatiana Espósito',   '(11) 3990-6653', true,     null, 4.50, date '2025-11-12'),
    ('Marcenaria Vila Nova',         'Marcenaria',            'Hugo Mendonça',      '(11) 2477-8890', true,  1600.00, 3.00, date '2025-01-15'),
    ('Serralheria Ferro & Arte',     'Serralheria',           'Ivan Krause',        '(11) 3155-2274', true,  1050.00, 3.50, date '2025-03-19'),
    ('Metalúrgica Aliança',          'Serralheria',           'Sandra Bellini',     '(11) 4266-9931', true,     null, 4.00, date '2025-08-07'),
    ('Espelhos & Cristais SP',       'Vidros e esquadrias',   'Júlio Bastos',       '(11) 2833-4416', true,   780.00, 2.50, date '2025-05-30'),
    ('Deck Master',                  'Pisos e madeiras',      'Priscila Chaves',    '(11) 3577-1284', true,     null, 4.00, date '2025-09-24'),
    ('Pedras Naturais Serra',        'Pedras naturais',       'Antônio Quirino',    '(11) 2160-7745', true,  1450.00, 3.00, date '2024-12-16'),
    ('Seixo Brasil',                 'Pedras naturais',       'Mônica Aleixo',      '(11) 3844-3352', false,    null, 3.00, date '2024-08-28'),
    ('Elevadores Residenciais Vert', 'Elevadores',            'Caio Bertazzi',      '(11) 4090-1167', true,  3500.00, 4.00, date '2025-02-20'),
    ('Piscinas Aquatec',             'Piscinas',              'Rafael Domingues',   '(11) 2755-8823', true,  1900.00, 3.50, date '2025-06-05'),
    ('Spa & Wellness Piscinas',      'Piscinas',              'Letícia Barroso',    '(11) 3311-9074', true,     null, 5.00, date '2025-10-28'),
    ('Papel de Parede Decorart',     'Revestimentos',         'Bruno Salvatore',    '(11) 2488-6610', true,   700.00, 3.00, date '2025-04-09'),
    ('Tapetes Oriente',              'Decoração',             'Yara Nakamura',      '(11) 3922-7758', true,     null, 4.50, date '2025-07-23'),
    ('Objetos de Casa',              'Decoração',             'Emerson Vidigal',    '(11) 2077-3341', false,   600.00, 2.00, date '2024-03-11'),
    ('Estofados Bonatto',            'Estofados',             'Karina Lessa',       '(11) 3466-2295', true,  1250.00, 3.00, date '2025-01-31'),
    ('Sofá Design',                  'Estofados',             'Thiago Bezerra',     '(11) 2599-8804', true,     null, 4.00, date '2025-08-15'),
    ('Churrasqueiras Gourmet SP',    'Área gourmet',          'Danilo Trevisan',    '(11) 3788-1129', true,   890.00, 3.00, date '2025-05-02'),
    ('Adega Clima Perfeito',         'Área gourmet',          'Vera Lúcia Pontes',  '(11) 2344-5583', true,     null, 4.50, date '2025-11-06')
)
insert into public.stores (
  owner_id,
  name, category, contact_name, phone, is_active,
  monthly_fixed_fee, default_commission_percent, start_date, notes
)
select (select up.id
          from public.user_profiles up
         where up.role = 'admin'::public.app_role
           and up.owner_id = up.id
         order by up.created_at
         limit 1),
       d.nome, d.categoria, d.responsavel, d.telefone, d.ativa,
       d.mensal, d.comissao, d.inicio, 'seed'
  from dados d
 where not exists (select 1 from public.stores s where s.name = d.nome);

-- --------------------------------------------------------------------------
-- PROFISSIONAIS
--
-- Muitos campos ficam em branco de propósito: a base real tem telefone,
-- e-mail, Instagram, endereço e aniversário ausentes em boa parte dos
-- registros, e as telas precisam aguentar isso.
-- --------------------------------------------------------------------------
with dados(nome, seg, email, insta, fone, endereco, cep, cidade, uf, dia, mes, ativo, regioes) as (
  values
    ('Ana Carolina Marques',      'arquiteto',         'ana.marques@exemplo.com',      '@anacarolina.arq', '(11) 98811-2233', 'Rua Harmonia, 420',        '05435-000', 'São Paulo',       'SP',   12,    3, true,  array['zona-sul-oeste','abc']),
    ('Beatriz Almeida Nunes',     'arquiteto',         'beatriz.nunes@exemplo.com',    '@bianunes.arq',    '(11) 99722-8140', null,                       null,        'São Paulo',       'SP', null, null, true,  array['zona-sul-oeste']),
    ('Camila Ferreira Rocha',     'arquiteto',         null,                           '@camilarocha',     '(11) 98455-6621', null,                       null,        'Santo André',     'SP',    5,    9, true,  array['abc']),
    ('Daniela Prado Vasques',     'arquiteto',         'dani.prado@exemplo.com',       null,               null,              'Av. Portugal, 1120',       '09040-000', 'Santo André',     'SP', null, null, true,  array['abc','zona-leste']),
    ('Eduarda Lopes Ribeiro',     'arquiteto',         null,                           null,               '(11) 97330-1188', null,                       null,        null,              null, null, null, true,  array[]::text[]),
    ('Fernanda Bueno Castro',     'arquiteto',         'fernanda.castro@exemplo.com',  '@fernandacastro',  '(11) 99011-4477', 'Rua dos Pinheiros, 880',   '05422-001', 'São Paulo',       'SP',   28,    7, true,  array['zona-sul-oeste']),
    ('Gabriela Monteiro Dias',    'arquiteto',         null,                           '@gabidias.arq',    '(11) 98266-9034', null,                       null,        'Guarulhos',       'SP', null, null, true,  array['zona-norte']),
    ('Helena Vasconcelos Amaral', 'arquiteto',         'helena@exemplo.com',           null,               '(11) 3344-5566',  null,                       null,        'São Bernardo',    'SP',    2,    3, true,  array['abc','zona-sul-oeste','litoral']),
    ('Isabela Craveiro Pinto',    'arquiteto',         null,                           null,               null,              null,                       null,        null,              null, null, null, true,  array[]::text[]),
    ('Juliana Sampaio Bruno',     'arquiteto',         'juliana.bruno@exemplo.com',    '@jubruno.arq',     '(11) 99544-7712', 'Al. Lorena, 640',          '01424-001', 'São Paulo',       'SP',   19,   11, true,  array['zona-sul-oeste']),
    ('Karina Lessa Moreira',      'arquiteto',         null,                           '@karinalessa',     '(11) 98177-2265', null,                       null,        'São Paulo',       'SP', null, null, true,  array['zona-leste']),
    ('Larissa Fontes Guedes',     'arquiteto',         'larissa.guedes@exemplo.com',   null,               null,              null,                       null,        'Campinas',        'SP',    8,    1, true,  array['interior']),
    ('Mariana Costa Belmonte',    'arquiteto',         null,                           null,               '(11) 97088-3391', null,                       null,        null,              null, null, null, false, array[]::text[]),
    ('Natália Siqueira Rangel',   'arquiteto',         'natalia.rangel@exemplo.com',   '@natrangel',       '(11) 99366-5502', 'Rua Vupabussu, 210',       '05088-000', 'São Paulo',       'SP',   14,    6, true,  array['zona-sul-oeste','zona-norte']),
    ('Olívia Tanaka Ferraz',      'arquiteto',         null,                           null,               '(11) 98622-1147', null,                       null,        'Santos',          'SP', null, null, true,  array['litoral']),
    ('Patrícia Rangel Coutinho',  'arquiteto',         'patricia.coutinho@exemplo.com', null,              null,              null,                       null,        'São Paulo',       'SP',   30,    4, true,  array['zona-leste','zona-norte']),
    ('Renata Aguiar Bittencourt', 'arquiteto',         null,                           '@renataaguiar',    '(11) 99855-6603', 'Rua Girassol, 75',         '05433-000', 'São Paulo',       'SP', null, null, true,  array['zona-sul-oeste']),
    ('Sabrina Duarte Peixoto',    'arquiteto',         'sabrina.peixoto@exemplo.com',  null,               '(11) 97411-8829', null,                       null,        'Diadema',         'SP',   23,    2, true,  array['abc']),
    ('Tatiana Espósito Braga',    'arquiteto',         null,                           null,               null,              null,                       null,        null,              null, null, null, true,  array[]::text[]),
    ('Ursula Kramer Antunes',     'arquiteto',         'ursula.antunes@exemplo.com',   '@ukramer.arq',     '(11) 98933-7710', null,                       null,        'São Paulo',       'SP',    9,    8, true,  array['zona-sul-oeste','zona-leste','zona-norte']),
    ('Vanessa Toledo Lira',       'arquiteto',         null,                           null,               '(11) 99277-4436', null,                       null,        'Osasco',          'SP', null, null, true,  array['zona-sul-oeste']),
    ('Adriana Peçanha Rios',      'arquiteto',         'adriana.rios@exemplo.com',     null,               null,              'Av. Rio Branco, 1500',     '01206-001', 'São Paulo',       'SP',   17,   10, false, array['zona-norte']),
    ('Bruna Salvatore Neves',     'arquiteto',         null,                           '@brunasalvatore',  '(11) 98544-0092', null,                       null,        'Guarujá',         'SP', null, null, true,  array['litoral']),
    ('Cristina Vasques Andrade',  'arquiteto',         'cristina.andrade@exemplo.com', null,               '(11) 99700-1123', null,                       null,        'São Paulo',       'SP',    4,   12, true,  array['zona-sul-oeste']),
    ('Débora Kimura Salgado',     'arquiteto',         null,                           null,               null,              null,                       null,        'Ribeirão Preto',  'SP', null, null, true,  array['interior']),
    ('Elaine Modesto Vieira',     'arquiteto',         'elaine.vieira@exemplo.com',    '@elainemodesto',   '(11) 98311-6674', 'Rua Cardeal Arcoverde, 22','05407-000', 'São Paulo',       'SP',   26,    5, true,  array['zona-sul-oeste','abc']),
    ('Flávia Bragança Melo',      'arquiteto',         null,                           null,               '(11) 97622-8845', null,                       null,        'São Caetano',     'SP', null, null, true,  array['abc']),
    ('Giovana Marroni Prates',    'arquiteto',         'giovana.prates@exemplo.com',   null,               null,              null,                       null,        null,              null,    1,    7, true,  array[]::text[]),
    ('Heloísa Barroso Campos',    'arquiteto',         null,                           '@heloisacampos',   '(11) 99188-3357', null,                       null,        'São Paulo',       'SP', null, null, true,  array['zona-leste']),
    ('Ingrid Yamamoto Lisboa',    'arquiteto',         'ingrid.lisboa@exemplo.com',    null,               '(11) 98066-2218', 'Rua Bela Cintra, 900',     '01415-000', 'São Paulo',       'SP',   11,    9, true,  array['zona-sul-oeste']),
    ('Joana Trevisan Bastos',     'arquiteto',         null,                           null,               null,              null,                       null,        'Sorocaba',        'SP', null, null, false, array['interior']),
    ('Letícia Chaves Fontoura',   'arquiteto',         'leticia.fontoura@exemplo.com', '@letifontoura',    '(11) 99433-7761', null,                       null,        'São Paulo',       'SP',   21,    4, true,  array['zona-norte','zona-leste']),
    ('Amanda Werneck Toledo',     'designer-interior', 'amanda.toledo@exemplo.com',    '@amandatoledo.di', '(11) 98722-5514', 'Rua Oscar Freire, 1200',   '01426-001', 'São Paulo',       'SP',   15,    6, true,  array['zona-sul-oeste']),
    ('Bianca Ramalho Serra',      'designer-interior', null,                           '@biancaserra',     '(11) 99055-8823', null,                       null,        'São Paulo',       'SP', null, null, true,  array['zona-sul-oeste','zona-leste']),
    ('Carolina Bellini Duarte',   'designer-interior', 'carol.duarte@exemplo.com',     null,               null,              null,                       null,        'Santo André',     'SP',    7,    2, true,  array['abc']),
    ('Diana Pontes Aleixo',       'designer-interior', null,                           null,               '(11) 98366-1140', null,                       null,        null,              null, null, null, true,  array[]::text[]),
    ('Estela Quirino Bezerra',    'designer-interior', 'estela.bezerra@exemplo.com',   '@estelaquirino',   '(11) 99611-4472', 'Al. Santos, 700',          '01418-100', 'São Paulo',       'SP',   29,   11, true,  array['zona-sul-oeste']),
    ('Fabiana Sarmento Luz',      'designer-interior', null,                           null,               '(11) 97255-9938', null,                       null,        'Guarulhos',       'SP', null, null, true,  array['zona-norte']),
    ('Gisele Bertazzi Rufino',    'designer-interior', 'gisele.rufino@exemplo.com',    null,               null,              null,                       null,        'São Paulo',       'SP',   13,    5, true,  array['zona-leste']),
    ('Helena Domingues Prata',    'designer-interior', null,                           '@helenaprata.di',  '(11) 98844-2206', null,                       null,        'Santos',          'SP', null, null, true,  array['litoral','zona-sul-oeste']),
    ('Iara Bonatto Meireles',     'designer-interior', 'iara.meireles@exemplo.com',    null,               '(11) 99177-6685', 'Rua Augusta, 2400',        '01412-100', 'São Paulo',       'SP',    3,    8, true,  array['zona-sul-oeste']),
    ('Júlia Vidigal Sampaio',     'designer-interior', null,                           null,               null,              null,                       null,        null,              null, null, null, false, array[]::text[]),
    ('Kelly Nakamura Braz',       'designer-interior', 'kelly.braz@exemplo.com',       '@kellynakamura',   '(11) 98511-3390', null,                       null,        'São Bernardo',    'SP',   18,    1, true,  array['abc']),
    ('Lúcia Camargo Portela',     'designer-interior', null,                           null,               '(11) 97744-8817', null,                       null,        'Campinas',        'SP', null, null, true,  array['interior']),
    ('Michele Krause Vilela',     'designer-interior', 'michele.vilela@exemplo.com',   null,               null,              null,                       null,        'São Paulo',       'SP',   24,    3, true,  array['zona-norte']),
    ('Nádia Ferraz Coelho',       'designer-interior', null,                           '@nadiacoelho.di',  '(11) 99322-7704', 'Rua Haddock Lobo, 300',    '01414-000', 'São Paulo',       'SP', null, null, true,  array['zona-sul-oeste','zona-leste']),
    ('Olga Bertolini Assis',      'designer-interior', 'olga.assis@exemplo.com',       null,               '(11) 98277-5561', null,                       null,        'Mogi das Cruzes', 'SP',   10,   10, true,  array['zona-leste']),
    ('Priscila Ribas Cordeiro',   'designer-interior', null,                           null,               null,              null,                       null,        null,              null, null, null, true,  array[]::text[]),
    ('Alexandre Duarte Motta',    'construtor',        'alexandre.motta@exemplo.com',  null,               '(11) 99811-2247', 'Av. Nações Unidas, 12000', '04578-000', 'São Paulo',       'SP',    6,    4, true,  array['zona-sul-oeste','abc']),
    ('Bruno Salgado Teixeira',    'construtor',        null,                           '@brunoteixeira',   '(11) 98466-9931', null,                       null,        'Santo André',     'SP', null, null, true,  array['abc']),
    ('Caio Bertaso Nogueira',     'construtor',        'caio.nogueira@exemplo.com',    null,               null,              null,                       null,        'São Paulo',       'SP',   20,    7, true,  array['zona-norte']),
    ('Danilo Trevisan Rocha',     'construtor',        null,                           null,               '(11) 97533-4428', null,                       null,        null,              null, null, null, true,  array[]::text[]),
    ('Emerson Pontes Barros',     'construtor',        'emerson.barros@exemplo.com',   '@emersonbarros',   '(11) 99244-8816', 'Rua Verbo Divino, 550',    '04719-000', 'São Paulo',       'SP',   16,    2, true,  array['zona-sul-oeste']),
    ('Fábio Cardoso Menezes',     'construtor',        null,                           null,               '(11) 98122-6673', null,                       null,        'Sorocaba',        'SP', null, null, false, array['interior']),
    ('Gustavo Ribas Portugal',    'construtor',        'gustavo.portugal@exemplo.com', null,               null,              null,                       null,        'Guarulhos',       'SP',   27,    9, true,  array['zona-norte','zona-leste']),
    ('Anderson Lima Peixoto',     'engenheiro',        'anderson.peixoto@exemplo.com', null,               '(11) 99677-1152', 'Av. Faria Lima, 3400',     '04538-132', 'São Paulo',       'SP',   22,    5, true,  array['zona-sul-oeste']),
    ('Carlos Eduardo Sanches',    'engenheiro',        null,                           '@cesanches.eng',   '(11) 98388-7724', null,                       null,        'São Caetano',     'SP', null, null, true,  array['abc']),
    ('Diego Fontoura Milani',     'engenheiro',        'diego.milani@exemplo.com',     null,               null,              null,                       null,        'São Paulo',       'SP', null, null, true,  array['zona-leste']),
    ('Eduardo Peixoto Farias',    'engenheiro',        null,                           null,               '(11) 97866-3305', null,                       null,        null,              null, null, null, true,  array[]::text[]),
    ('Henrique Modesto Vargas',   'engenheiro',        'henrique.vargas@exemplo.com',  '@hvargas.eng',     '(11) 99500-2288', 'Rua Butantã, 180',         '05424-000', 'São Paulo',       'SP',   25,   12, true,  array['zona-sul-oeste','interior']),
    ('Ivan Krause Delgado',       'engenheiro',        null,                           null,               '(11) 98055-9917', null,                       null,        'Santos',          'SP', null, null, true,  array['litoral']),
    ('Leandro Prazeres Coutinho', 'corretor',          'leandro.coutinho@exemplo.com', '@leandroimoveis',  '(11) 99433-1160', 'Av. Paulista, 2000',       '01310-200', 'São Paulo',       'SP',   31,    1, true,  array['zona-sul-oeste','zona-norte']),
    ('Marcos Tavares Brandão',    'corretor',          null,                           null,               '(11) 98711-5543', null,                       null,        'Santo André',     'SP', null, null, true,  array['abc']),
    ('Newton Sarmento Vieira',    'corretor',          'newton.vieira@exemplo.com',    null,               null,              null,                       null,        'São Paulo',       'SP', null, null, false, array['zona-leste']),
    ('Otávio Camargo Bellini',    'corretor',          null,                           '@otaviocamargo',   '(11) 99066-4471', null,                       null,        'Praia Grande',    'SP',   12,    8, true,  array['litoral'])
)
insert into public.professionals (
  owner_id,
  name, segment_id, email, instagram, phone, address, postal_code,
  city, state, birthday_day, birthday_month, notes, is_active
)
select (select up.id
          from public.user_profiles up
         where up.role = 'admin'::public.app_role
           and up.owner_id = up.id
         order by up.created_at
         limit 1),
       d.nome, s.id, d.email, d.insta, d.fone, d.endereco, d.cep,
       d.cidade, d.uf, d.dia::smallint, d.mes::smallint, 'seed', d.ativo
  from dados d
  join public.segments s on s.slug = d.seg
 where not exists (select 1 from public.professionals p where p.name = d.nome);

-- Vínculos de região. Reaplicar não duplica: a PK já cobre o par.
with dados(nome, regioes) as (
  values
    ('Ana Carolina Marques',      array['zona-sul-oeste','abc']),
    ('Beatriz Almeida Nunes',     array['zona-sul-oeste']),
    ('Camila Ferreira Rocha',     array['abc']),
    ('Daniela Prado Vasques',     array['abc','zona-leste']),
    ('Fernanda Bueno Castro',     array['zona-sul-oeste']),
    ('Gabriela Monteiro Dias',    array['zona-norte']),
    ('Helena Vasconcelos Amaral', array['abc','zona-sul-oeste','litoral']),
    ('Juliana Sampaio Bruno',     array['zona-sul-oeste']),
    ('Karina Lessa Moreira',      array['zona-leste']),
    ('Larissa Fontes Guedes',     array['interior']),
    ('Natália Siqueira Rangel',   array['zona-sul-oeste','zona-norte']),
    ('Olívia Tanaka Ferraz',      array['litoral']),
    ('Patrícia Rangel Coutinho',  array['zona-leste','zona-norte']),
    ('Renata Aguiar Bittencourt', array['zona-sul-oeste']),
    ('Sabrina Duarte Peixoto',    array['abc']),
    ('Ursula Kramer Antunes',     array['zona-sul-oeste','zona-leste','zona-norte']),
    ('Vanessa Toledo Lira',       array['zona-sul-oeste']),
    ('Adriana Peçanha Rios',      array['zona-norte']),
    ('Bruna Salvatore Neves',     array['litoral']),
    ('Cristina Vasques Andrade',  array['zona-sul-oeste']),
    ('Débora Kimura Salgado',     array['interior']),
    ('Elaine Modesto Vieira',     array['zona-sul-oeste','abc']),
    ('Flávia Bragança Melo',      array['abc']),
    ('Heloísa Barroso Campos',    array['zona-leste']),
    ('Ingrid Yamamoto Lisboa',    array['zona-sul-oeste']),
    ('Joana Trevisan Bastos',     array['interior']),
    ('Letícia Chaves Fontoura',   array['zona-norte','zona-leste']),
    ('Amanda Werneck Toledo',     array['zona-sul-oeste']),
    ('Bianca Ramalho Serra',      array['zona-sul-oeste','zona-leste']),
    ('Carolina Bellini Duarte',   array['abc']),
    ('Estela Quirino Bezerra',    array['zona-sul-oeste']),
    ('Fabiana Sarmento Luz',      array['zona-norte']),
    ('Gisele Bertazzi Rufino',    array['zona-leste']),
    ('Helena Domingues Prata',    array['litoral','zona-sul-oeste']),
    ('Iara Bonatto Meireles',     array['zona-sul-oeste']),
    ('Kelly Nakamura Braz',       array['abc']),
    ('Lúcia Camargo Portela',     array['interior']),
    ('Michele Krause Vilela',     array['zona-norte']),
    ('Nádia Ferraz Coelho',       array['zona-sul-oeste','zona-leste']),
    ('Olga Bertolini Assis',      array['zona-leste']),
    ('Alexandre Duarte Motta',    array['zona-sul-oeste','abc']),
    ('Bruno Salgado Teixeira',    array['abc']),
    ('Caio Bertaso Nogueira',     array['zona-norte']),
    ('Emerson Pontes Barros',     array['zona-sul-oeste']),
    ('Fábio Cardoso Menezes',     array['interior']),
    ('Gustavo Ribas Portugal',    array['zona-norte','zona-leste']),
    ('Anderson Lima Peixoto',     array['zona-sul-oeste']),
    ('Carlos Eduardo Sanches',    array['abc']),
    ('Diego Fontoura Milani',     array['zona-leste']),
    ('Henrique Modesto Vargas',   array['zona-sul-oeste','interior']),
    ('Ivan Krause Delgado',       array['litoral']),
    ('Leandro Prazeres Coutinho', array['zona-sul-oeste','zona-norte']),
    ('Marcos Tavares Brandão',    array['abc']),
    ('Newton Sarmento Vieira',    array['zona-leste']),
    ('Otávio Camargo Bellini',    array['litoral'])
)
insert into public.professional_regions (professional_id, region_id)
select p.id, r.id
  from dados d
  join public.professionals p on p.name = d.nome
  join public.regions r on r.slug = any(d.regioes)
on conflict (professional_id, region_id) do nothing;

commit;
