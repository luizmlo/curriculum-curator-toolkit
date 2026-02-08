"""
================================================================================
KIT DO PROFESSOR CURADOR - Backend (FastAPI)
================================================================================

Este arquivo contém a aplicação backend FastAPI que fornece:
- API REST para pesquisa de tópicos e geração de currículos com IA
- Geração de prompts personalizados para ferramentas educacionais
- Assistente de chatbot com consciência do currículo

FLUXO DE DADOS:
1. Frontend (static/) → Requisições HTTP → Endpoints FastAPI
2. Endpoints → Chamadas à API Gemini → Processamento de IA
3. Respostas JSON → Frontend → Renderização na interface

ARQUITETURA:
- Modelos Pydantic: Definem estruturas de dados (requests/responses)
- Funções de IA: Chamam Gemini API para processamento
- Endpoints: Expõem funcionalidades via REST API
- Servidor estático: Serve arquivos HTML/CSS/JS

DEPENDÊNCIAS EXTERNAS:
- Google Gemini API: Processamento de linguagem natural e geração de conteúdo
- FastAPI: Framework web assíncrono
- Pydantic: Validação de dados

AUTOR: ToolKit do Professor Curador
VERSÃO: 2.0
"""

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
from google import genai
import os
from dotenv import load_dotenv
import json
import asyncio

# Carregar variáveis de ambiente do arquivo .env
load_dotenv()

# ============================================================================
# INICIALIZAÇÃO DA APLICAÇÃO
# ============================================================================

app = FastAPI(title="Curriculum Curator Toolkit")

# Inicializar cliente Gemini
# IMPORTANTE: A chave da API deve estar no arquivo .env como GEMINI_API_KEY
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("AVISO: GEMINI_API_KEY não encontrada no ambiente!")
    print("Por favor, crie um arquivo .env com: GEMINI_API_KEY=sua_chave_aqui")
    client = None
else:
    client = genai.Client(api_key=api_key)

# Servir arquivos estáticos (HTML, CSS, JavaScript)
app.mount("/static", StaticFiles(directory="static"), name="static")

GEMINI_MODEL = "gemini-2.5-flash"


class TopicRequest(BaseModel):
    topic: str


class SubTopicCard(BaseModel):
    id: str
    title: str
    description: str
    order: int


class CurriculumRequest(BaseModel):
    topic: str
    research_sources: List[Dict]
    block1: List[SubTopicCard]
    block2: List[SubTopicCard]


class MethodCardRequest(BaseModel):
    topic: str
    subtopic_id: str
    subtopic_title: str
    subtopic_description: str
    block_id: str
    previous_subtopics: List[Dict]
    research_sources: List[Dict]
    method_card_type: str  # 'video', 'theory', 'case_study', 'practice', 'quiz'


class MethodCardResponse(BaseModel):
    subtopic_id: str
    method_card_type: str
    prompt: str


class ChatbotAction(BaseModel):
    type: str  # 'add', 'edit', 'remove', 'reorder'
    blockId: Optional[str] = None  # 'block1' or 'block2' for add/reorder
    cardId: Optional[str] = None  # For edit, remove, reorder
    title: Optional[str] = None  # For add, edit
    description: Optional[str] = None  # For add, edit
    position: Optional[int] = None  # For add (optional position)
    cardIds: Optional[List[str]] = None  # For reorder (ordered list of IDs)


class ChatbotRequest(BaseModel):
    message: str
    topic: Optional[str] = None
    research_sources: Optional[List[Dict]] = None
    curriculum: Dict  # Contains block1 and block2 lists
    chat_history: Optional[List[Dict]] = None  # Previous messages for context


class ChatbotResponse(BaseModel):
    actions: List[ChatbotAction]
    message: Optional[str] = None  # Optional confirmation/explanation message
    error: Optional[str] = None  # Error message if parsing failed
    feedback_questions: Optional[List[str]] = None  # 3 feedback questions after actions


# ============================================================================
# CONFIGURAÇÃO DOS METHOD CARDS
# ============================================================================
# Define os 5 tipos de method cards disponíveis e suas ferramentas associadas

METHOD_CARDS = {
    'video': {
        'name': 'Apresentação em Vídeo',
        'tool': 'inVideo AI',
        'description': 'Gera prompt para criar vídeo educativo de 60-90 segundos'
    },
    'theory': {
        'name': 'Guia Teórico',
        'tool': 'NotebookLM',
        'description': 'Gera prompt para criar guia de estudo analítico'
    },
    'case_study': {
        'name': 'Estudo de Caso (Podcast)',
        'tool': 'ElevenLabs',
        'description': 'Gera roteiro de podcast estilo true crime educativo'
    },
    'practice': {
        'name': 'Visualização Interativa',
        'tool': 'Google Colab',
        'description': 'Gera código Python para laboratório virtual interativo'
    },
    'quiz': {
        'name': 'Quiz de Diagnóstico',
        'tool': 'Google Forms',
        'description': 'Gera questões de múltipla escolha em formato markdown'
    }
}


def call_gemini(system_prompt: str, user_prompt: str, model: Optional[str] = None) -> str:
    """Função auxiliar para chamar a API Gemini (síncrona)."""
    if not client:
        raise ValueError("Cliente Gemini não inicializado. Verifique se a variável GEMINI_API_KEY está configurada no arquivo .env")
    
    # Combinar system e user prompt para Gemini
    full_prompt = f"{system_prompt}\n\n{user_prompt}"
    
    try:
        response = client.models.generate_content(
            model=model if model else GEMINI_MODEL,
            contents=full_prompt
        )
        
        if not response:
            raise ValueError("Resposta vazia da API Gemini")
        
        # Gemini retorna o texto diretamente via propriedade .text
        if hasattr(response, 'text') and response.text:
            return response.text
        
        # Fallback para estruturas alternadas de resposta
        if hasattr(response, 'candidates') and response.candidates and len(response.candidates) > 0:
            candidate = response.candidates[0]
            if hasattr(candidate, 'content'):
                if hasattr(candidate.content, 'parts') and candidate.content.parts:
                    part = candidate.content.parts[0]
                    if hasattr(part, 'text'):
                        return part.text
                    return str(part)
                if hasattr(candidate.content, 'text'):
                    return candidate.content.text
                return str(candidate.content)
        
        # Se chegou aqui, a resposta não está no formato esperado
        raise ValueError(f"Formato de resposta inesperado da API Gemini. Tipo: {type(response)}, Atributos: {dir(response)[:10]}")
            
    except Exception as e:
        raise ValueError(f"Erro na API Gemini: {str(e)}")


# ============================================================================
# FUNÇÕES DE PROCESSAMENTO COM IA
# ============================================================================

async def research_topic(topic: str) -> List[Dict]:
    """
    Usa Gemini para pesquisar e encontrar fontes de pesquisa sobre um tópico.
    
    FLUXO:
    1. Recebe tópico do usuário
    2. Chama Gemini com prompt especializado em pesquisa acadêmica
    3. Extrai JSON com fontes (livros, artigos, ensaios)
    4. Retorna lista de fontes estruturadas
    
    Args:
        topic: Tópico a ser pesquisado
    
    Returns:
        List[Dict]: Lista de fontes com campos: title, authors, type, description, relevance
    """
    system_prompt = "Você é um pesquisador acadêmico especialista. Forneça recomendações de fontes de pesquisa precisas e bem estruturadas. Responda sempre em português brasileiro."
    
    user_prompt = f"""Pesquise o tópico "{topic}" e forneça uma lista de 8-12 fontes de pesquisa de alta qualidade, incluindo:
- Livros acadêmicos
- Artigos de pesquisa
- Artigos de revisão
- Ensaios ou monografias importantes

Para cada fonte, forneça:
- Título
- Autor(es)
- Tipo (livro/artigo/ensaio)
- Breve descrição (1-2 frases)
- Por que é relevante

Formate como um array JSON com os campos: title, authors, type, description, relevance.
Seja específico e foque em obras fundamentais e contemporâneas. Responda em português brasileiro."""

    try:
        content = await asyncio.to_thread(call_gemini, system_prompt, user_prompt)
        
        # Tentar extrair JSON da resposta
        try:
            # Encontrar array JSON na resposta
            start_idx = content.find('[')
            end_idx = content.rfind(']') + 1
            if start_idx != -1 and end_idx > start_idx:
                json_str = content[start_idx:end_idx]
                sources = json.loads(json_str)
                return sources
            else:
                # Fallback: parsear como texto estruturado
                return parse_sources_from_text(content)
        except json.JSONDecodeError:
            return parse_sources_from_text(content)
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao pesquisar tópico: {str(e)}")


def parse_sources_from_text(text: str) -> List[Dict]:
    """
    Parser de fallback para quando a extração JSON falha.
    
    Tenta extrair informações de fontes de um texto não estruturado.
    Usado quando o Gemini não retorna JSON válido.
    
    Args:
        text: Texto não estruturado com informações sobre fontes
    
    Returns:
        List[Dict]: Lista de fontes parseadas (máximo 12)
    """
    sources = []
    lines = text.split('\n')
    current_source = {}
    
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        
        if 'título' in line.lower() or 'title' in line.lower() or 'livro' in line.lower() or 'book' in line.lower() or line.startswith('-'):
            if current_source:
                sources.append(current_source)
            current_source = {
                "title": line.replace('-', '').replace('Título:', '').replace('Title:', '').strip(),
                "authors": "",
                "type": "livro",
                "description": "",
                "relevance": ""
            }
        elif 'autor' in line.lower() or 'author' in line.lower():
            current_source["authors"] = line.replace('Autor:', '').replace('Autores:', '').replace('Author:', '').replace('Authors:', '').strip()
        elif 'tipo' in line.lower() or 'type' in line.lower():
            current_source["type"] = line.replace('Tipo:', '').replace('Type:', '').strip().lower()
        elif 'descrição' in line.lower() or 'description' in line.lower():
            current_source["description"] = line.replace('Descrição:', '').replace('Description:', '').strip()
        elif 'relevância' in line.lower() or 'relevance' in line.lower():
            current_source["relevance"] = line.replace('Relevância:', '').replace('Relevance:', '').strip()
        elif current_source and not any(key in line.lower() for key in ['título', 'title', 'autor', 'author', 'tipo', 'type', 'descrição', 'description', 'relevância', 'relevance']):
            if not current_source.get("description"):
                current_source["description"] = line
            elif not current_source.get("relevance"):
                current_source["relevance"] = line
    
    if current_source:
        sources.append(current_source)
    
    # Garantir estrutura mínima
    for i, source in enumerate(sources):
        if not source.get("title"):
            sources[i]["title"] = f"Fonte {i+1}"
        if not source.get("authors"):
            sources[i]["authors"] = "Vários"
        if not source.get("type"):
            sources[i]["type"] = "livro"
    
    return sources[:12]  # Limitar a 12 fontes


async def generate_subtopics(topic: str, research_sources: List[Dict]) -> Dict[str, List[SubTopicCard]]:
    """
    Gera sub-tópicos como habilidades progressivas divididas em dois blocos principais.
    
    FLUXO:
    1. Prepara contexto com tópico e fontes de pesquisa
    2. Chama Gemini com prompt especializado em design curricular
    3. Extrai JSON com block1 e block2
    4. Converte para formato SubTopicCard
    5. Retorna currículo estruturado
    
    Args:
        topic: Tópico principal do currículo
        research_sources: Lista de fontes de pesquisa relevantes
    
    Returns:
        Dict com 'block1' e 'block2', cada um contendo lista de SubTopicCard
    """
    
    # Preparar texto de fontes, se houver
    sources_section = ""
    if research_sources and len(research_sources) > 0:
        sources_text = "\n".join([
            f"- {s.get('title', 'Desconhecido')} por {s.get('authors', 'Desconhecido')} ({s.get('type', 'fonte')})"
            for s in research_sources[:8]
        ])
        sources_section = f"\n\nFontes de pesquisa relevantes:\n{sources_text}\n"
    
    system_prompt = "Você é um especialista em design curricular baseado em competências. Crie habilidades progressivas e práticas que se constroem umas sobre as outras, focando em competências mensuráveis e aplicáveis. Responda sempre em português brasileiro."
    
    user_prompt = f"""Com base no tópico "{topic}"{sources_section}

Gere um currículo abrangente focado em HABILIDADES e COMPETÊNCIAS progressivas organizadas em DOIS blocos/módulos lógicos.

IMPORTANTE: Os sub-tópicos devem ser HABILIDADES específicas e práticas que se constroem progressivamente, não apenas tópicos teóricos. Cada habilidade deve ser:
- Uma competência mensurável e aplicável
- Baseada nas habilidades anteriores (construção progressiva)
- Específica para entender tópicos complexos e nichos do assunto
- Prática e acionável

Estrutura:
- Bloco 1 (Fundamentos): Habilidades básicas essenciais que são pré-requisitos
- Bloco 2 (Avançado): Habilidades complexas que se apoiam nas do Bloco 1

Para cada habilidade/sub-tópico, forneça:
- Um título claro descrevendo a habilidade específica
- Uma descrição explicando por que essa habilidade é importante e como se relaciona com as anteriores

Gere 6-10 habilidades por bloco (12-20 no total), garantindo progressão lógica e construção sobre habilidades anteriores.

Retorne APENAS um JSON válido com esta estrutura (sem texto adicional antes ou depois):
{{
  "block1": [
    {{"title": "Habilidade/Competência específica", "description": "Descrição explicando a habilidade e sua importância"}},
    ...
  ],
  "block2": [
    {{"title": "Habilidade/Competência específica", "description": "Descrição explicando a habilidade e como constrói sobre as anteriores"}},
    ...
  ]
}}

Responda sempre em português brasileiro."""

    try:
        content = await asyncio.to_thread(call_gemini, system_prompt, user_prompt)
        
        # Extrair JSON
        start_idx = content.find('{')
        end_idx = content.rfind('}') + 1
        if start_idx != -1 and end_idx > start_idx:
            json_str = content[start_idx:end_idx]
            try:
                curriculum_data = json.loads(json_str)
            except json.JSONDecodeError as je:
                raise ValueError(f"Erro ao analisar JSON: {str(je)}. Conteúdo recebido: {content[:500]}")
            
            # Validar e converter para formato SubTopicCard
            try:
                result = {
                    "block1": [
                        SubTopicCard(
                            id=f"block1-{i}",
                            title=item.get("title", f"Habilidade {i+1}"),
                            description=item.get("description", ""),
                            order=i
                        ).model_dump()
                        for i, item in enumerate(curriculum_data.get("block1", []))
                    ],
                    "block2": [
                        SubTopicCard(
                            id=f"block2-{i}",
                            title=item.get("title", f"Habilidade {i+1}"),
                            description=item.get("description", ""),
                            order=i
                        ).model_dump()
                        for i, item in enumerate(curriculum_data.get("block2", []))
                    ]
                }
                
                return result
            except Exception as ce:
                raise ValueError(f"Erro ao converter para SubTopicCard: {str(ce)}. Dados: {curriculum_data}")
        else:
            raise ValueError(f"Não foi possível encontrar JSON no conteúdo. Conteúdo recebido: {content[:500]}")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar sub-tópicos: {str(e)}")


async def generate_method_card_prompt(
    topic: str,
    subtopic_title: str,
    subtopic_description: str,
    previous_subtopics: List[Dict],
    research_sources: List[Dict],
    method_card_type: str
) -> str:
    """
    Gera um prompt específico para um dos 5 method cards.
    
    FLUXO:
    1. Recebe contexto do subtópico e curso
    2. Seleciona prompt template baseado no tipo de method card
    3. Chama Gemini com prompt especializado
    4. Retorna prompt pronto para usar na ferramenta específica
    
    Tipos de method cards:
    - 'video': Prompt para inVideo AI (vídeo educativo)
    - 'theory': Prompt para NotebookLM (guia teórico)
    - 'case_study': Roteiro para ElevenLabs (podcast educativo)
    - 'practice': Código Python para Google Colab (visualização interativa)
    - 'quiz': Questões para Google Forms (quiz de diagnóstico)
    
    Args:
        topic: Tópico principal do curso
        subtopic_title: Título do subtópico/habilidade
        subtopic_description: Descrição do subtópico
        previous_subtopics: Lista de subtópicos anteriores (para contexto)
        research_sources: Fontes de pesquisa relevantes
        method_card_type: Tipo de method card ('video', 'theory', etc.)
    
    Returns:
        str: Prompt gerado pronto para usar na ferramenta específica
    """
    
    # Preparar contexto de subitens anteriores
    previous_context = ""
    if previous_subtopics:
        previous_context = "\n\nHabilidades Pré-requisitas já estudadas:\n"
        for idx, prev in enumerate(previous_subtopics, 1):
            previous_context += f"{idx}. {prev.get('title', '')}: {prev.get('description', '')}\n"
    
    # Preparar fontes relevantes
    sources_text = ""
    if research_sources:
        sources_text = "\n\nFontes de Pesquisa Relevantes:\n"
        sources_text += "\n".join([
            f"- {s.get('title', 'Desconhecido')} por {s.get('authors', 'Unknown')} ({s.get('type', 'fonte')})"
            for s in research_sources[:5]
        ])
    
    # Selecionar e gerar o prompt baseado no tipo do method card
    system_prompt = ""
    user_prompt = ""
    
    if method_card_type == 'video':
        # Method Card 1: Video Presentation (inVideo AI)
        system_prompt = "Você é um Diretor Criativo de Documentários Científicos e Pedagogo especializado. Crie prompts otimizados para ferramentas de geração de vídeo educacional. Responda sempre em português brasileiro."
        user_prompt = f"""Atue como um Diretor Criativo de Documentários Científicos e Pedagogo.
Inspire-se em canais como 3blue1brown, Veritasium, Vsauce.
Escreva um roteiro detalhado para um vídeo curto (60 a 90 segundos) que introduza um novo tópico aos meus alunos.

TÓPICO DA AULA: {subtopic_title}
CONTEXTO DO CURSO: {topic}
DESCRIÇÃO DO SUBTÓPICO: {subtopic_description}
{previous_context}{sources_text}

Sua tarefa é escrever um "Prompt Otimizado" que será usado diretamente na ferramenta "InVideo AI".
A estrutura narrativa do vídeo deve seguir a lógica da "Curiosidade Investigativa":
1. **O Gancho (0-10s):** Comece com uma pergunta intrigante ou um fato contraintuitivo do mundo real conectado ao tema. (Misture curiosidade com um leve senso de urgência ou impacto).
2. **A Ponte (10-40s):** Conecte esse fato à teoria que está sendo estudada, de maneira divertida. Use analogias visuais.
3. **O Convite (40-90s):** Termine dizendo o que o aluno será capaz de fazer/resolver após dominar essa aula.

SAÍDA ESPERADA:
Escreva APENAS o prompt em inglês e inclua as configurações abaixo.
Settings: - Language: Portuguese (Brazil) - Voice: Male and professional - Subtitles: Portuguese (Brazil)
O prompt deve começar com: "Create a 60-second YouTube Short explaining [TOPIC] with a curious and energetic tone. Target audience: Students."

IMPORTANTE: Retorne APENAS o prompt final, sem explicações adicionais."""
    
    elif method_card_type == 'theory':
        # Method Card 2: Theory Guide (NotebookLM)
        system_prompt = "Você é um especialista em criar prompts otimizados para o NotebookLM. Gere prompts diretos, claros e específicos que o NotebookLM usará para criar conteúdo educacional. O prompt gerado deve ser copiado e colado diretamente no NotebookLM. Responda sempre em português brasileiro."
        user_prompt = f"""Crie um prompt completo para o NotebookLM que gere um "Guia de Estudo Analítico" sobre o tópico abaixo.

TÓPICO: {subtopic_title}
CONTEXTO DO CURSO: {topic}
DESCRIÇÃO: {subtopic_description}
{previous_context}{sources_text}

INSTRUÇÕES:
O prompt que você vai gerar será usado DIRETAMENTE no NotebookLM. O NotebookLM lerá esse prompt e criará um guia de estudo completo para alunos de graduação.

Gere um prompt que instrua o NotebookLM a:

1. Assumir a persona de um Professor Pesquisador e Analista Crítico especializado em {topic}.

2. Criar um Guia de Estudo Analítico completo e estruturado que inclua:

   SEÇÃO 1 - Visão Geral e Relevância Estratégica:
   - Definir tecnicamente o tópico "{subtopic_title}"
   - Analisar sua importância estratégica fundamentando-se nas fontes disponíveis

   SEÇÃO 2 - Análise dos Pilares Teóricos:
   - Identificar e explicar os conceitos-chave (pilares teóricos) que sustentam o tópico
   - Descrever como esses conceitos se relacionam e dependem uns dos outros

   SEÇÃO 3 - Análise Crítica de Caso de Uso:
   - Selecionar um caso de uso ou aplicação prática relevante relacionado ao tópico
   - Analisar o problema que essa aplicação resolveu, o impacto gerado e os desafios enfrentados

   SEÇÃO 4 - Implicações e Desafios:
   - Discutir limitações, desafios de implementação e implicações técnicas do tópico

   SEÇÃO 5 - Referências Bibliográficas:
   - Listar todas as fontes utilizadas em formato acadêmico
   - Usar citações inline numéricas [1], [2], [3] ao longo do texto sempre que informações vierem diretamente das fontes

3. REGRAS IMPORTANTES:
   - Usar citações inline [1], [2], etc. sempre que citar fontes
   - Se uma seção não puder ser preenchida por falta de informações nas fontes, escrever o cabeçalho e declarar: "As fontes fornecidas não cobrem este ponto."
   - Usar linguagem acadêmica, técnica e precisa, adequada para alunos de graduação
   - O guia deve ser denso em informação e altamente didático

FORMATO DE SAÍDA:
Retorne APENAS o prompt pronto para ser usado no NotebookLM. O prompt deve começar diretamente com as instruções, como se você estivesse falando com o NotebookLM. Não inclua explicações ou metatexto. O professor vai copiar e colar seu prompt diretamente no NotebookLM.

Exemplo de início do prompt: "Crie um Guia de Estudo Analítico sobre [tópico] seguindo esta estrutura: [...]" """
    
    elif method_card_type == 'case_study':
        # Method Card 3: Case Study Podcast
        system_prompt = "Você é um Roteirista de Podcast Investigativo especializado em conteúdo educacional. Crie roteiros envolventes estilo true crime para ensinar conceitos técnicos. Responda sempre em português brasileiro."
        user_prompt = f"""Atue como um Roteirista de Podcast Investigativo (estilo "True Crime" ou "Discovery").
Preciso de um roteiro completo para um episódio curto (3 a 5 minutos) sobre um Estudo de Caso.

TÓPICO DA AULA: {subtopic_title}
CONTEXTO DO CURSO: {topic}
DESCRIÇÃO: {subtopic_description}
{previous_context}{sources_text}

Sua tarefa:
1. **Encontre um Caso:** Busque um acidente real, falha famosa ou desafio histórico ligado a esse tópico. (Se não houver um caso famoso direto, crie um cenário hipotético ultra-realista em uma indústria).
2. **Crie os Personagens:**
    * **Host (Alex):** Curioso, faz as perguntas que o público leigo faria.
    * **Especialista (Dra. Santos):** Especialista Sênior, explica a falha técnica usando os conceitos da disciplina ({topic}).
3. **Estrutura do Roteiro:**
    * **Abertura:** O som do desastre/problema. O contexto.
    * **A Investigação:** O Host pergunta "O que deu errado?". A Especialista explica os conceitos técnicos envolvidos.
    * **A Lição:** Como o problema é resolvido ou prevenido hoje.

SAÍDA OBRIGATÓRIA:
Escreva o roteiro em formato de diálogo teatral.
Inclua "Marcadores de Emoção" entre parênteses para guiar a IA de voz (ex: [Tom sério], [Surpreso], [Didático]).

IMPORTANTE: Retorne APENAS o roteiro completo, sem explicações adicionais."""
    
    elif method_card_type == 'practice':
        # Method Card 4: Practice Visualization (Google Colab)
        system_prompt = "Você é um Professor Criativo e Engenheiro especializado em Visualizações Científicas Interativas. Crie experiências de aprendizado visualmente envolventes com código Python executável para Google Colab. Seja criativo, didático e inspire curiosidade. Responda sempre em português brasileiro."
        user_prompt = f"""**Contexto:**
Você é um Professor Criativo especializado em criar experiências de aprendizado visualmente envolventes para a disciplina {topic}.
Sua missão é criar um laboratório virtual interativo ou visualização didática no Google Colab que ajude os alunos a compreenderem profundamente o conceito.

**Tópico da Aula:** {subtopic_title}
**Descrição:** {subtopic_description}
{previous_context}{sources_text}

**Sua Tarefa:**
Crie um código Python completo, executável e didático que demonstre visualmente o conceito estudado. Seja criativo e pense em formas interessantes de visualizar o fenômeno ou conceito - pode ser através de:
- Gráficos interativos e animações
- Simulações visuais
- Visualizações comparativas
- Aplicações interativas simples
- Demonstrações práticas do conceito em ação

**Orientações de Design:**
1. **Criatividade Visual:** Pense em formas engenhosas e claras de mostrar o conceito. Use analogias visuais, animações, ou múltiplas perspectivas quando apropriado.
2. **Didática:** Inclua comentários explicativos no código que ajudem o aluno a entender o que está acontecendo. Explique o "porquê", não apenas o "como".
3. **Bibliotecas Flexíveis:** Use as bibliotecas que fizerem mais sentido para a visualização (matplotlib, plotly, numpy, pandas, etc.). Não há obrigatoriedade de usar widgets ou sliders - o importante é que a visualização seja clara e educativa.
4. **Completude:** O código deve ser executável diretamente em uma célula do Google Colab, incluindo imports necessários.
5. **Interpretação:** Adicione comentários ou prints que expliquem o que a visualização mostra e como ela ajuda a entender o conceito.
6. **Robustez:** Trate erros matemáticos ou de entrada quando apropriado.

**Formato de Saída:**
Retorne APENAS o código Python puro, diretamente, sem blocos markdown, sem explicações antes ou depois, sem ```python``` ou formatação markdown. Apenas o código executável que pode ser copiado e colado diretamente em uma célula do Colab."""
    
    elif method_card_type == 'quiz':
        # Method Card 5: Quiz Questions
        system_prompt = "Você é um Professor Universitário exigente, mas didático. Crie questões de múltipla escolha que testem compreensão prática, não memorização. Responda sempre em português brasileiro. Retorne APENAS texto simples (plain text), sem formatação Markdown, sem fórmulas LaTeX, sem símbolos especiais ou caracteres de formatação. Use apenas texto puro, fácil de ler, copiar e colar no Google Forms."
        user_prompt = f"""Atue como um Professor Universitário exigente, mas didático.
Com base no conteúdo abaixo, crie um "Quiz de Diagnóstico" com 4 questões de múltipla escolha.

TÓPICO DA AULA: {subtopic_title}
CONTEXTO DO CURSO: {topic}
DESCRIÇÃO: {subtopic_description}
{previous_context}{sources_text}

REGRAS DE OURO PARA AS QUESTÕES:
1. Proibido Decorar: Não faça perguntas de definição (ex: "O que é X?").
2. Foco em Cenário: Crie situações-problema. Use frases como "Se a variável X dobrar...", "Em um cenário onde...", "Um profissional observou que...".
3. Distratores Inteligentes: As alternativas erradas não devem ser absurdas. Elas devem representar erros comuns de conceito que os alunos costumam cometer.
4. Aplicação Prática: Cada questão deve testar a capacidade de aplicar o conceito em uma situação real.

FORMATO DE SAÍDA (texto simples, sem Markdown):
Para cada questão, use este formato exato:

Questão 1:
[Enunciado com cenário prático, em texto simples, sem símbolos especiais ou formatação]

A) [Alternativa A - texto simples]
B) [Alternativa B - texto simples]
C) [Alternativa C - texto simples]
D) [Alternativa D - texto simples]

Questão 2:
[Enunciado...]

A) [Alternativa A]
B) [Alternativa B]
C) [Alternativa C]
D) [Alternativa D]

[Continue para Questão 3 e Questão 4 no mesmo formato]

GABARITO:
Questão 1: [Letra correta: A, B, C ou D]
Questão 2: [Letra correta: A, B, C ou D]
Questão 3: [Letra correta: A, B, C ou D]
Questão 4: [Letra correta: A, B, C ou D]

EXPLICAÇÕES:
Questão 1: [Explicação da resposta correta e por que as outras estão erradas - texto simples, sem formatação]
Questão 2: [Explicação - texto simples]
Questão 3: [Explicação - texto simples]
Questão 4: [Explicação - texto simples]

REGRAS CRÍTICAS DE FORMATAÇÃO:
- Use APENAS texto simples (plain text)
- NÃO use Markdown (sem asteriscos, sem negrito, sem itálico, sem listas formatadas)
- NÃO use fórmulas LaTeX (sem símbolos matemáticos especiais, escreva por extenso ou use notação simples)
- NÃO use símbolos especiais ou caracteres de formatação
- Use apenas letras, números, vírgulas, pontos, dois pontos e parênteses
- Use quebras de linha simples para separar questões
- Texto deve ser fácil de copiar e colar diretamente no Google Forms"""
    
    else:
        raise ValueError(f"Tipo de method card inválido: {method_card_type}")
    
    try:
        content = await asyncio.to_thread(call_gemini, system_prompt, user_prompt, GEMINI_MODEL)
        return content.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar prompt do method card {method_card_type}: {str(e)}")


@app.get("/", response_class=HTMLResponse)
async def read_root():
    """Serve a página HTML principal."""
    with open("static/index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


@app.post("/api/research")
async def research_endpoint(request: TopicRequest):
    """
    Endpoint de pesquisa: Encontra fontes de pesquisa sobre um tópico usando IA.
    
    FLUXO:
    1. Recebe tópico do frontend
    2. Chama research_topic() que usa Gemini
    3. Retorna lista de fontes estruturadas
    
    Args:
        request: TopicRequest com campo 'topic'
    
    Returns:
        JSONResponse: {"sources": List[Dict]} com fontes encontradas
    """
    try:
        sources = await research_topic(request.topic)
        return JSONResponse(content={"sources": sources})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/generate-curriculum")
async def generate_curriculum_endpoint(request: CurriculumRequest):
    """
    Endpoint de geração de currículo: Gera habilidades/subtópicos usando IA.
    
    FLUXO:
    1. Recebe tópico e fontes de pesquisa (opcional)
    2. Se já houver block1/block2, retorna como está
    3. Senão, chama generate_subtopics() que usa Gemini
    4. Retorna currículo estruturado em dois blocos
    
    Args:
        request: CurriculumRequest com topic, research_sources, block1, block2
    
    Returns:
        JSONResponse: {"block1": [...], "block2": [...]} com habilidades geradas
    """
    try:
        # Se o currículo já existe com fontes, apenas retorná-lo
        if request.block1 or request.block2:
            return JSONResponse(content={
                "block1": request.block1,
                "block2": request.block2
            })
        
        if not request.topic or not request.topic.strip():
            raise HTTPException(status_code=400, detail="Tópico não fornecido")
        
        curriculum = await generate_subtopics(request.topic, request.research_sources or [])
        return JSONResponse(content=curriculum)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar currículo: {str(e)}")


@app.post("/api/generate-method-card-prompt")
async def generate_method_card_prompt_endpoint(request: MethodCardRequest):
    """
    Endpoint de geração de prompts: Gera prompt personalizado para ferramenta educacional.
    
    FLUXO:
    1. Recebe contexto do subtópico e tipo de method card
    2. Chama generate_method_card_prompt() que usa Gemini
    3. Retorna prompt pronto para copiar e usar na ferramenta
    
    Args:
        request: MethodCardRequest com todos os dados do subtópico
    
    Returns:
        JSONResponse: {"subtopic_id": str, "method_card_type": str, "prompt": str}
    """
    try:
        prompt = await generate_method_card_prompt(
            request.topic,
            request.subtopic_title,
            request.subtopic_description,
            request.previous_subtopics,
            request.research_sources,
            request.method_card_type
        )
        return JSONResponse(content={
            "subtopic_id": request.subtopic_id,
            "method_card_type": request.method_card_type,
            "prompt": prompt
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def generate_feedback_questions(
    actions: List[ChatbotAction],
    topic: Optional[str],
    curriculum: Dict
) -> List[str]:
    """
    Gera 3 perguntas de feedback contextualizadas baseadas nas ações executadas.
    
    FLUXO:
    1. Recebe lista de ações que foram executadas
    2. Chama Gemini para gerar perguntas relevantes sobre as mudanças
    3. Retorna 3 perguntas para o usuário responder
    
    Args:
        actions: Lista de ações executadas pelo chatbot
        topic: Tópico do currículo
        curriculum: Estado atual do currículo
    
    Returns:
        List[str]: Lista com exatamente 3 perguntas de feedback
    """
    if not actions or len(actions) == 0:
        return []
    
    # Descrever ações executadas
    actions_description = "Ações executadas:\n"
    for i, action in enumerate(actions, 1):
        if action.type == 'add':
            actions_description += f"{i}. Adicionado card '{action.title}' no {action.blockId}\n"
        elif action.type == 'edit':
            actions_description += f"{i}. Editado card {action.cardId}\n"
        elif action.type == 'remove':
            actions_description += f"{i}. Removido card {action.cardId}\n"
        elif action.type == 'reorder':
            actions_description += f"{i}. Reordenados cards no {action.blockId}\n"
    
    system_prompt = """Você é um assistente educacional que ajuda professores a refinar seus currículos.
Após executar mudanças no currículo, você deve gerar 3 perguntas de feedback relevantes e úteis.

As perguntas devem:
- Ser específicas ao contexto das ações executadas
- Ajudar o professor a pensar em melhorias ou ajustes
- Ser curtas e diretas
- Ser em português brasileiro
- Variar entre: verificação de satisfação, sugestões de melhoria, e necessidades adicionais

Retorne APENAS um array JSON com exatamente 3 strings (perguntas), sem texto adicional.
Formato: ["Pergunta 1?", "Pergunta 2?", "Pergunta 3?"]"""
    
    user_prompt = f"""Tópico do currículo: {topic or 'Não especificado'}

{actions_description}

Gere 3 perguntas de feedback relevantes sobre essas mudanças."""
    
    try:
        content = await asyncio.to_thread(call_gemini, system_prompt, user_prompt, GEMINI_MODEL)
        
        # Extrair JSON da resposta
        start_idx = content.find('[')
        end_idx = content.rfind(']') + 1
        
        if start_idx != -1 and end_idx > start_idx:
            json_str = content[start_idx:end_idx]
            questions = json.loads(json_str)
            
            # Garantir que temos exatamente 3 perguntas
            if isinstance(questions, list) and len(questions) >= 3:
                return questions[:3]
            elif isinstance(questions, list) and len(questions) > 0:
                # Se tiver menos de 3, completar com perguntas genéricas
                while len(questions) < 3:
                    questions.append("Há algo mais que você gostaria de ajustar no currículo?")
                return questions[:3]
        
        # Fallback: perguntas genéricas
        return [
            "As mudanças atendem às suas expectativas?",
            "Há algo que você gostaria de ajustar ou melhorar?",
            "Precisa de mais alguma modificação no currículo?"
        ]
    except Exception as e:
        # Fallback em caso de erro
        return [
            "As mudanças atendem às suas expectativas?",
            "Há algo que você gostaria de ajustar ou melhorar?",
            "Precisa de mais alguma modificação no currículo?"
        ]


async def parse_chatbot_command(
    user_message: str,
    topic: Optional[str],
    curriculum: Dict,
    research_sources: Optional[List[Dict]] = None,
    chat_history: Optional[List[Dict]] = None
) -> List[ChatbotAction]:
    """
    Parseia comando em linguagem natural em ações estruturadas usando Gemini.
    
    FLUXO:
    1. Prepara contexto completo do currículo atual
    2. Inclui histórico de chat para contexto conversacional
    3. Chama Gemini com prompt especializado em parsing de comandos
    4. Extrai JSON com ações estruturadas
    5. Valida e retorna lista de ChatbotAction
    
    O modelo tem autoridade criativa para:
    - Criar múltiplos cards de uma vez
    - Inferir títulos e descrições
    - Ordenar logicamente (básico → avançado)
    
    Args:
        user_message: Comando do usuário em linguagem natural
        topic: Tópico do currículo
        curriculum: Estado atual do currículo (block1 e block2)
        research_sources: Fontes de pesquisa (opcional)
        chat_history: Histórico de mensagens anteriores (opcional)
    
    Returns:
        List[ChatbotAction]: Lista de ações a serem executadas
    """
    
    # Preparar contexto do currículo
    curriculum_text = "Estado atual do currículo:\n"
    curriculum_text += f"Tópico: {topic or 'Não especificado'}\n\n"
    
    # Bloco 1
    block1_cards = curriculum.get("block1", [])
    curriculum_text += "Bloco 1 (Fundamentos):\n"
    if block1_cards:
        for i, card in enumerate(block1_cards, 1):
            curriculum_text += f"  {i}. ID: {card.get('id', 'N/A')} | Título: {card.get('title', 'N/A')} | Descrição: {card.get('description', 'N/A')[:100]}\n"
    else:
        curriculum_text += "  (vazio)\n"
    
    # Bloco 2
    block2_cards = curriculum.get("block2", [])
    curriculum_text += "\nBloco 2 (Aplicações Práticas):\n"
    if block2_cards:
        for i, card in enumerate(block2_cards, 1):
            curriculum_text += f"  {i}. ID: {card.get('id', 'N/A')} | Título: {card.get('title', 'N/A')} | Descrição: {card.get('description', 'N/A')[:100]}\n"
    else:
        curriculum_text += "  (vazio)\n"
    
    # Preparar histórico de chat se houver
    history_text = ""
    if chat_history:
        history_text = "\nHistórico da conversa:\n"
        for msg in chat_history[-5:]:  # Últimas 5 mensagens
            role = msg.get('role', 'user')
            content = msg.get('content', '')
            history_text += f"{role}: {content}\n"
    
    system_prompt = """Você é um assistente criativo e inteligente especializado em gerenciar currículos educacionais. 
Sua tarefa é interpretar comandos em linguagem natural e convertê-los em ações estruturadas JSON.

IMPORTANTE: Seja CRIATIVO e FLEXÍVEL. Você tem autoridade para:
- Criar múltiplos cards de uma vez quando solicitado
- Inferir títulos e descrições quando o usuário fornecer apenas um tópico geral
- Dividir tópicos amplos em múltiplos cards específicos
- Usar seu conhecimento educacional para criar descrições relevantes
- Ser proativo: se o usuário pedir "5 cards sobre X", crie 5 cards diferentes e relevantes sobre aspectos de X
- ORDENAR LOGICAMENTE: quando criar múltiplos cards, coloque os mais básicos/introdutórios PRIMEIRO (sem position, serão adicionados sequencialmente) e os mais avançados DEPOIS
- PROGRESSÃO PEDAGÓGICA: organize os cards em ordem crescente de complexidade, do mais fundamental ao mais avançado

Estrutura do currículo:
- Existem dois blocos: "block1" (Fundamentos) e "block2" (Aplicações Práticas)
- Cada card tem: id (string), title (string), description (string), order (int)
- A lista é ordenada: ordem 0 = PRIMEIRO/INÍCIO/TOPO, ordem maior = ÚLTIMO/FIM/FINAL

IMPORTANTE SOBRE POSICIONAMENTO:
- "Primeiro", "início", "topo", "começo" = ordem 0 (primeira posição)
- "Último", "fim", "final", "final da lista" = maior ordem (última posição)
- Quando adicionar um card SEM especificar posição, adicione ao FINAL (não inclua "position")
- Quando adicionar "no início" ou "no começo", use position: 0
- Quando adicionar "no final" ou "no fim", NÃO inclua "position" (será adicionado automaticamente ao final)

Tipos de ações disponíveis:
1. ADD: Adicionar novo card
   {"type": "add", "blockId": "block1" ou "block2", "title": "título", "description": "descrição", "position": número opcional}
   - Se não especificar posição, NÃO inclua o campo "position" (será adicionado ao final)
   - Se especificar "no início" ou "primeiro", use "position": 0
   - Se especificar "no final" ou "último", NÃO inclua "position"

2. EDIT: Editar card existente
   {"type": "edit", "cardId": "id-do-card", "title": "novo título" (opcional), "description": "nova descrição" (opcional)}

3. REMOVE: Remover card
   {"type": "remove", "cardId": "id-do-card"}

4. REORDER: Reordenar cards em um bloco
   {"type": "reorder", "blockId": "block1" ou "block2", "cardIds": ["id1", "id2", "id3", ...]}
   - O array cardIds deve conter TODOS os IDs do bloco na ordem desejada
   - Primeiro ID no array = primeiro na lista (ordem 0)
   - Último ID no array = último na lista (maior ordem)

REGRAS CRÍTICAS:
- Retorne APENAS um array JSON válido de ações, sem texto adicional
- Use os IDs exatos dos cards quando referenciar cards existentes
- Para reordenar, forneça TODOS os IDs do bloco na ordem desejada
- Seja preciso: use os IDs exatos do currículo fornecido
- Seja CRIATIVO: quando o usuário pedir múltiplos cards, crie múltiplas ações ADD
- Seja INTELIGENTE: se o usuário pedir "5 cards sobre Python", crie 5 cards diferentes sobre aspectos relevantes de Python
- Seja PROATIVO: se faltar informação, use seu conhecimento para criar títulos e descrições relevantes
- ORDENE LOGICAMENTE: quando criar múltiplos cards, coloque-os no array na ordem pedagógica correta - básico/fundamental PRIMEIRO, avançado DEPOIS
- PROGRESSÃO: o primeiro card no array será o primeiro visualmente (mais básico), o último será o último (mais avançado)
- NÃO retorne array vazio [] a menos que seja realmente impossível interpretar o comando
- Responda sempre em português brasileiro quando necessário explicar algo

Exemplos:
Comando: "Adicione um card sobre 'Introdução a Python' no bloco 1"
Resposta: [{"type": "add", "blockId": "block1", "title": "Introdução a Python", "description": "Conceitos básicos da linguagem Python"}]
(Não inclui "position" - será adicionado ao final)

Comando: "Crie 5 cards sobre Python no bloco 1"
Resposta: [
  {"type": "add", "blockId": "block1", "title": "Sintaxe Básica do Python", "description": "Aprendendo a estrutura fundamental da linguagem Python"},
  {"type": "add", "blockId": "block1", "title": "Tipos de Dados e Variáveis", "description": "Compreendendo os tipos primitivos e como declarar variáveis"},
  {"type": "add", "blockId": "block1", "title": "Estruturas de Controle", "description": "Condicionais (if/else) e loops (for/while) em Python"},
  {"type": "add", "blockId": "block1", "title": "Estruturas de Dados", "description": "Listas, dicionários, tuplas e sets em Python"},
  {"type": "add", "blockId": "block1", "title": "Funções e Módulos", "description": "Criando e organizando código com funções e módulos"}
]
NOTA: Os cards são adicionados na ordem do array - o primeiro será o primeiro na lista (mais básico), o último será o último (mais avançado). Sempre ordene do mais fundamental ao mais complexo.

Comando: "Adicione 3 cards sobre machine learning no bloco 2"
Resposta: [
  {"type": "add", "blockId": "block2", "title": "Introdução ao Machine Learning", "description": "Conceitos fundamentais e tipos de aprendizado"},
  {"type": "add", "blockId": "block2", "title": "Algoritmos de Classificação", "description": "Regressão logística, árvores de decisão e SVM"},
  {"type": "add", "blockId": "block2", "title": "Validação e Métricas", "description": "Técnicas de validação cruzada e métricas de avaliação"}
]
NOTA: Sempre ordene do mais básico (primeiro no array) ao mais avançado (último no array). O primeiro card do array será o primeiro na lista visual.

Comando: "Adicione um card sobre 'Pré-requisitos' no início do bloco 1"
Resposta: [{"type": "add", "blockId": "block1", "title": "Pré-requisitos", "description": "...", "position": 0}]

Comando: "Mova o primeiro card do bloco 1 para o final"
Resposta: [{"type": "reorder", "blockId": "block1", "cardIds": ["block1-1", "block1-2", "block1-0"]}]
(block1-0 era o primeiro, agora é o último no array)

Comando: "Mova o último card para o início"
Resposta: [{"type": "reorder", "blockId": "block1", "cardIds": ["block1-2", "block1-0", "block1-1"]}]
(block1-2 era o último, agora é o primeiro no array)

Comando: "Edite o card block1-0 para ter o título 'Novo Título'"
Resposta: [{"type": "edit", "cardId": "block1-0", "title": "Novo Título"}]

Comando: "Remova o card sobre X"
Resposta: [{"type": "remove", "cardId": "block1-2"}]"""
    
    user_prompt = f"""{curriculum_text}{history_text}

Comando do usuário: {user_message}

Retorne APENAS um array JSON com as ações a executar. Se não conseguir interpretar o comando, retorne [].

Resposta (array JSON):"""
    
    try:
        content = await asyncio.to_thread(call_gemini, system_prompt, user_prompt, GEMINI_MODEL)
        
        # Extrair JSON da resposta
        start_idx = content.find('[')
        end_idx = content.rfind(']') + 1
        
        if start_idx != -1 and end_idx > start_idx:
            json_str = content[start_idx:end_idx]
            actions_data = json.loads(json_str)
            
            # Validar e converter para ChatbotAction
            actions = []
            for action_data in actions_data:
                try:
                    action = ChatbotAction(**action_data)
                    actions.append(action)
                except Exception as e:
                    # Ignorar ações inválidas
                    continue
            
            return actions
        else:
            return []
            
    except json.JSONDecodeError:
        return []
    except Exception as e:
        raise ValueError(f"Erro ao parsear comando: {str(e)}")


@app.post("/api/chatbot")
async def chatbot_endpoint(request: ChatbotRequest):
    """
    Endpoint do chatbot: Parseia comandos em linguagem natural e retorna ações + feedback.
    
    FLUXO:
    1. Recebe mensagem do usuário e estado atual do currículo
    2. Chama parse_chatbot_command() para parsear comando
    3. Se houver ações, chama generate_feedback_questions()
    4. Retorna ações + perguntas de feedback
    
    Args:
        request: ChatbotRequest com message, topic, curriculum, chat_history
    
    Returns:
        JSONResponse: ChatbotResponse com actions e feedback_questions
    """
    try:
        actions = await parse_chatbot_command(
            request.message,
            request.topic,
            request.curriculum,
            request.research_sources,
            request.chat_history
        )
        
        # Gerar perguntas de feedback se houver ações
        feedback_questions = []
        if actions and len(actions) > 0:
            feedback_questions = await generate_feedback_questions(
                actions,
                request.topic,
                request.curriculum
            )
        
        response = ChatbotResponse(
            actions=[action.model_dump() for action in actions],
            message=None,
            feedback_questions=feedback_questions if feedback_questions else None
        )
        
        return JSONResponse(content=response.model_dump())
        
    except Exception as e:
        error_response = ChatbotResponse(
            actions=[],
            message=None,
            error=str(e),
            feedback_questions=None
        )
        return JSONResponse(content=error_response.model_dump(), status_code=500)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
