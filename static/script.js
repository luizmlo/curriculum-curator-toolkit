// ============================================================================
// KIT DO PROFESSOR CURADOR - Frontend JavaScript
// Versão: 2.0 - Method Cards Implementados
// ============================================================================

// ============================================================================
// ESTADO GLOBAL
// ============================================================================

let currentTopic = '';
let researchSources = [];
let selectedSources = new Set();
let curriculum = {
    block1: [],
    block2: []
};
let methodCardPrompts = {};
let currentMethodCardSubtopic = null;
let editingCardId = null;
let editingBlockId = null;
let cardCounter = 0;
let currentSessionId = null;
let workflowMode = 'manual';

// Chatbot state
let chatHistory = [];
let isChatbotOpen = false;

const STORAGE_KEY = 'curator_professor_sessions';

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    const researchBtn = document.getElementById('research-btn');
    const directGenerateBtn = document.getElementById('direct-generate-btn');
    const manualCreateBtn = document.getElementById('manual-create-btn');
    const generateCurriculumBtn = document.getElementById('generate-curriculum-btn');
    const skipSourcesBtn = document.getElementById('skip-sources-btn');
    const topicInput = document.getElementById('topic-input');
    
    if (researchBtn) researchBtn.addEventListener('click', researchTopic);
    if (directGenerateBtn) directGenerateBtn.addEventListener('click', generateCurriculumDirectly);
    if (manualCreateBtn) manualCreateBtn.addEventListener('click', createManualCurriculum);
    if (generateCurriculumBtn) generateCurriculumBtn.addEventListener('click', generateCurriculum);
    if (skipSourcesBtn) skipSourcesBtn.addEventListener('click', skipSourcesAndGenerate);
    
    if (topicInput) {
        topicInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                if (workflowMode === 'direct') {
                    generateCurriculumDirectly();
                } else if (workflowMode === 'research') {
                    researchTopic();
                } else if (workflowMode === 'manual') {
                    createManualCurriculum();
                }
            }
        });
    }
    
    // Workflow mode listeners
    const workflowRadios = document.querySelectorAll('input[name="workflow-mode"]');
    workflowRadios.forEach(radio => {
        radio.addEventListener('change', updateWorkflowMode);
    });
    
    // Event listeners para botões de fechar do modal de method cards
    const methodCardsModalClose = document.querySelector('#method-cards-modal .close');
    const methodCardsModalCloseBtn = document.querySelector('#method-cards-modal .modal-actions .btn-secondary');
    
    if (methodCardsModalClose) {
        methodCardsModalClose.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeMethodCardsModal();
        });
    }
    
    if (methodCardsModalCloseBtn) {
        methodCardsModalCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeMethodCardsModal();
        });
    }
    
    checkForAutoSave();
    updateWorkflowMode();
    
    // Setup scroll following for floating button
    setupChatbotFloatingButton();
    
    // Close chatbot modal when clicking outside
    const chatbotModal = document.getElementById('chatbot-modal');
    if (chatbotModal) {
        chatbotModal.addEventListener('click', (e) => {
            if (e.target === chatbotModal) {
                toggleChatbot();
            }
        });
    }
});

function setupChatbotFloatingButton() {
    const floatingBtn = document.getElementById('chatbot-floating-btn');
    if (!floatingBtn) return;
    
    // Button is already fixed position, no need for scroll following logic
    // But we can add a pulse animation when there are unread messages
    // This will be handled in the message display functions
}

// ============================================================================
// WORKFLOW E NAVEGAÇÃO
// ============================================================================
// Gerencia os diferentes modos de workflow: manual, pesquisa ou geração direta

function updateWorkflowMode() {
    /**
     * Atualiza a interface baseado no modo de workflow selecionado.
     * Modos disponíveis:
     * - 'manual': Criar currículo manualmente
     * - 'direct': Gerar currículo diretamente com IA
     * - 'research': Pesquisar fontes primeiro, depois gerar
     */
    const radioButtons = document.querySelectorAll('input[name="workflow-mode"]');
    workflowMode = 'manual';
    
    radioButtons.forEach(radio => {
        if (radio.checked) {
            workflowMode = radio.value;
        }
    });
    
    const directBtn = document.getElementById('direct-generate-btn');
    const researchBtn = document.getElementById('research-btn');
    const manualBtn = document.getElementById('manual-create-btn');
    
    if (directBtn && researchBtn && manualBtn) {
        if (workflowMode === 'direct') {
            directBtn.style.display = 'inline-block';
            researchBtn.style.display = 'none';
            manualBtn.style.display = 'none';
        } else if (workflowMode === 'research') {
            directBtn.style.display = 'none';
            researchBtn.style.display = 'inline-block';
            manualBtn.style.display = 'none';
        } else {
            directBtn.style.display = 'none';
            researchBtn.style.display = 'none';
            manualBtn.style.display = 'inline-block';
        }
    }
}

// ============================================================================
// PESQUISA DE TÓPICO E FONTES
// ============================================================================
// Funções para pesquisar tópicos e gerenciar fontes de pesquisa

async function researchTopic() {
    /**
     * Pesquisa um tópico usando IA e encontra fontes de pesquisa relevantes.
     * 
     * FLUXO:
     * 1. Pega tópico do input
     * 2. Chama /api/research
     * 3. Exibe fontes encontradas
     * 4. Usuário pode selecionar fontes para usar na geração
     */
    const topic = document.getElementById('topic-input').value.trim();
    if (!topic) {
        alert('Por favor, digite um tópico de pesquisa');
        return;
    }

    currentTopic = topic;
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingText = document.getElementById('loading-text');
    const researchBtn = document.getElementById('research-btn');
    
    loadingIndicator.style.display = 'flex';
    loadingText.textContent = 'Pesquisando tópico e encontrando fontes...';
    researchBtn.disabled = true;

    try {
        const response = await fetch('/api/research', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: topic })
        });

        if (!response.ok) throw new Error('Falha na pesquisa');

        const data = await response.json();
        researchSources = data.sources;
        displaySources(researchSources);
        document.getElementById('sources-section').style.display = 'block';
        document.getElementById('sources-section').scrollIntoView({ behavior: 'smooth' });
        updateSaveButton();
        
    } catch (error) {
        alert('Erro ao pesquisar tópico: ' + error.message);
        console.error('Erro na pesquisa:', error);
    } finally {
        loadingIndicator.style.display = 'none';
        researchBtn.disabled = false;
    }
}

function displaySources(sources) {
    const sourcesList = document.getElementById('sources-list');
    sourcesList.innerHTML = '';
    selectedSources.clear();
    
    sources.forEach((source, index) => {
        if (!source.id) {
            source.id = `source-${index}`;
        }
    });

    sources.forEach((source, index) => {
        const card = document.createElement('div');
        card.className = 'source-card';
        const sourceId = source.id || `source-${index}`;
        const isSelected = selectedSources.has(sourceId);
        
        card.innerHTML = `
            <input type="checkbox" class="source-checkbox" 
                   data-source-id="${sourceId}" 
                   ${isSelected ? 'checked' : ''}
                   onchange="toggleSourceSelection('${sourceId}')">
            <h4>${escapeHtml(source.title || 'Sem título')}</h4>
            <div class="source-meta">
                <strong>${escapeHtml(source.authors || 'Autores desconhecidos')}</strong> • 
                <em>${escapeHtml(source.type || 'fonte')}</em>
            </div>
            <div class="source-description">
                ${escapeHtml(source.description || 'Nenhuma descrição disponível')}
            </div>
        `;
        
        if (isSelected) card.classList.add('selected');
        
        card.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
                toggleSourceSelection(sourceId);
            }
        });
        
        sourcesList.appendChild(card);
    });
    
    updateDeleteButton();
}

function toggleSourceSelection(sourceId) {
    const checkbox = document.querySelector(`[data-source-id="${sourceId}"]`);
    const card = checkbox.closest('.source-card');
    
    if (selectedSources.has(sourceId)) {
        selectedSources.delete(sourceId);
        card.classList.remove('selected');
        checkbox.checked = false;
    } else {
        selectedSources.add(sourceId);
        card.classList.add('selected');
        checkbox.checked = true;
    }
    
    updateDeleteButton();
}

function updateDeleteButton() {
    const deleteBtn = document.getElementById('delete-selected-btn');
    if (selectedSources.size > 0) {
        deleteBtn.style.display = 'inline-block';
        deleteBtn.textContent = `Remover Selecionadas (${selectedSources.size})`;
    } else {
        deleteBtn.style.display = 'none';
    }
}

function deleteSelectedSources() {
    if (selectedSources.size === 0) return;
    
    if (!confirm(`Tem certeza que deseja remover ${selectedSources.size} fonte(s) selecionada(s)?`)) {
        return;
    }
    
    const sourcesToKeep = [];
    researchSources.forEach((source, index) => {
        const sourceId = source.id || `source-${index}`;
        if (!selectedSources.has(sourceId)) {
            sourcesToKeep.push(source);
        }
    });
    
    researchSources = sourcesToKeep;
    selectedSources.clear();
    displaySources(researchSources);
}

function skipSourcesAndGenerate() {
    if (!currentTopic) {
        alert('Por favor, digite um tópico de pesquisa primeiro');
        return;
    }
    
    researchSources = [];
    selectedSources.clear();
    generateCurriculumWithSources([], false);
}

// ============================================================================
// CRIAÇÃO MANUAL DE CURRÍCULO
// ============================================================================
// Permite criar currículo manualmente sem usar IA

function createManualCurriculum() {
    /**
     * Inicializa a seção de currículo para criação manual.
     * Permite adicionar cards manualmente antes de gerar com IA.
     */
    const topic = document.getElementById('topic-input').value.trim();
    
    // Tópico é opcional para criação manual, mas se fornecido, salva
    if (topic) {
        currentTopic = topic;
    } else {
        // Se não houver tópico, permite criar mesmo assim
        currentTopic = '';
    }
    
    // Inicializar curriculum se estiver vazio
    if (!curriculum.block1 && !curriculum.block2) {
        curriculum = {
            block1: [],
            block2: []
        };
    }
    
    // Garantir que cardCounter está inicializado
    if (cardCounter === 0) {
        cardCounter = 1;
    }
    
    // Mostrar seção de currículo
    displayCurriculum();
    document.getElementById('curriculum-section').style.display = 'block';
    document.getElementById('curriculum-section').scrollIntoView({ behavior: 'smooth' });
    updateSaveButton();
}

// ============================================================================
// GERAÇÃO DE CURRÍCULO
// ============================================================================
// Funções para gerar currículo usando IA (com ou sem fontes)

async function generateCurriculumDirectly() {
    /**
     * Gera currículo diretamente sem pesquisar fontes primeiro.
     * Usa apenas o tópico fornecido.
     */
    const topic = document.getElementById('topic-input').value.trim();
    if (!topic) {
        alert('Por favor, digite um tópico para o currículo');
        return;
    }

    currentTopic = topic;
    researchSources = [];
    selectedSources.clear();
    
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingText = document.getElementById('loading-text');
    const generateBtn = document.getElementById('direct-generate-btn');
    
    loadingIndicator.style.display = 'flex';
    loadingText.textContent = 'Gerando currículo de habilidades...';
    generateBtn.disabled = true;

    await generateCurriculumWithSources([], true);
}

async function generateCurriculum() {
    if (!currentTopic) {
        alert('Por favor, digite um tópico primeiro');
        return;
    }

    let sourcesToUse = [];
    if (researchSources.length > 0) {
        if (selectedSources.size > 0) {
            sourcesToUse = researchSources.filter((source, index) => {
                const sourceId = source.id || `source-${index}`;
                return selectedSources.has(sourceId);
            });
        } else {
            sourcesToUse = researchSources;
        }
    }
    
    await generateCurriculumWithSources(sourcesToUse, false);
}

async function generateCurriculumWithSources(sourcesToUse, isDirectMode) {
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingText = document.getElementById('loading-text');
    
    let buttonToDisable = isDirectMode 
        ? document.getElementById('direct-generate-btn')
        : document.getElementById('generate-curriculum-btn');
    
    loadingIndicator.style.display = 'flex';
    loadingText.textContent = 'Gerando currículo de habilidades...';
    if (buttonToDisable) buttonToDisable.disabled = true;

    try {
        const response = await fetch('/api/generate-curriculum', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                topic: currentTopic,
                research_sources: sourcesToUse,
                block1: [],
                block2: []
            })
        });

        if (!response.ok) throw new Error('Falha na geração do currículo');

        const data = await response.json();
        curriculum = {
            block1: data.block1 || [],
            block2: data.block2 || []
        };
        
        // Atualizar contador de cartões
        const maxId = [...curriculum.block1, ...curriculum.block2].map(c => {
            const parts = c.id.split('-');
            if (parts.length > 1) {
                const idNum = parseInt(parts[1]);
                return isNaN(idNum) ? 0 : idNum;
            }
            return 0;
        });
        cardCounter = (maxId.length > 0 ? Math.max(...maxId) : 0) + 1;
        
        displayCurriculum();
        document.getElementById('curriculum-section').style.display = 'block';
        document.getElementById('curriculum-section').scrollIntoView({ behavior: 'smooth' });
        updateSaveButton();
        
        if (isDirectMode) {
            document.getElementById('sources-section').style.display = 'none';
        }
        
    } catch (error) {
        alert('Erro ao gerar currículo: ' + error.message);
        console.error('Erro na geração de currículo:', error);
    } finally {
        loadingIndicator.style.display = 'none';
        if (buttonToDisable) buttonToDisable.disabled = false;
    }
}

// ============================================================================
// RENDERIZAÇÃO DE CURRÍCULO E CARDS
// ============================================================================
// Funções para renderizar o currículo na interface

function displayCurriculum() {
    /**
     * Renderiza todo o currículo na interface.
     * Atualiza ambos os blocos e salva automaticamente se necessário.
     */
    // Garantir que curriculum está inicializado
    if (!curriculum) {
        curriculum = {
            block1: [],
            block2: []
        };
    }
    
    // Garantir que os blocos existem
    if (!curriculum.block1) curriculum.block1 = [];
    if (!curriculum.block2) curriculum.block2 = [];
    
    displayBlock('block1', curriculum.block1);
    displayBlock('block2', curriculum.block2);
    autoSaveIfNeeded();
}

function displayBlock(blockId, cards) {
    const container = document.getElementById(blockId);
    container.innerHTML = '';

    const sortedCards = [...cards].sort((a, b) => (a.order || 0) - (b.order || 0));

    sortedCards.forEach((card) => {
        const cardElement = createCardElement(card, blockId);
        container.appendChild(cardElement);
    });
}

function createCardElement(card, blockId) {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'topic-card';
    cardDiv.draggable = true;
    cardDiv.id = card.id;
    cardDiv.dataset.blockId = blockId;
    cardDiv.dataset.order = card.order || 0;

    const order = (parseInt(card.order) || 0) + 1;
    const methodCardCount = methodCardPrompts[card.id] ? Object.keys(methodCardPrompts[card.id]).length : 0;
    const hasPrompts = methodCardCount > 0;
    const promptBadge = hasPrompts ? `<span class="prompt-count-badge">${methodCardCount}/5</span>` : '';
    
    cardDiv.innerHTML = `
        <div class="card-number">${order}</div>
        <div class="card-header">
            <h4>${escapeHtml(card.title || 'Habilidade Sem Título')}</h4>
        </div>
        <div class="card-description">${escapeHtml(card.description || 'Sem descrição')}</div>
        <div class="card-actions">
            <button class="btn btn-small ${hasPrompts ? 'btn-success' : 'btn-primary'}" data-action="prompts" data-card-id="${card.id}" data-block-id="${blockId}" title="Gerar Prompts Personalizados">
                📋 Prompts ${promptBadge}
            </button>
            <button class="btn btn-small btn-secondary" data-action="edit" data-card-id="${card.id}" data-block-id="${blockId}">Editar</button>
            <button class="btn btn-small btn-danger" data-action="remove" data-card-id="${card.id}" data-block-id="${blockId}">Remover</button>
        </div>
    `;

    // Event listeners de drag
    cardDiv.addEventListener('dragstart', dragStart);
    cardDiv.addEventListener('dragend', dragEnd);
    
    // Event listeners dos botões
    attachCardButtonListeners(cardDiv, card, blockId);

    return cardDiv;
}

function attachCardButtonListeners(cardDiv, card, blockId) {
    const promptsBtn = cardDiv.querySelector('[data-action="prompts"]');
    const editBtn = cardDiv.querySelector('[data-action="edit"]');
    const removeBtn = cardDiv.querySelector('[data-action="remove"]');
    
    const preventDrag = (btn) => {
        if (!btn) return;
        btn.draggable = false;
        btn.addEventListener('mousedown', (e) => e.stopPropagation());
        btn.addEventListener('dragstart', (e) => e.preventDefault());
    };
    
    if (promptsBtn) {
        preventDrag(promptsBtn);
        promptsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openMethodCardsModal(card.id, blockId);
        });
    }
    
    if (editBtn) {
        preventDrag(editBtn);
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            editCard(card.id, blockId);
        });
    }
    
    if (removeBtn) {
        preventDrag(removeBtn);
        removeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeCard(card.id, blockId);
        });
    }
}

// ============================================================================
// GERENCIAMENTO DE CARDS (CRUD)
// ============================================================================

function addCard(blockId) {
    // Garantir que curriculum está inicializado
    if (!curriculum) {
        curriculum = {
            block1: [],
            block2: []
        };
    }
    
    // Garantir que o bloco existe
    if (!curriculum[blockId]) {
        curriculum[blockId] = [];
    }
    
    // Garantir que cardCounter está inicializado
    if (cardCounter === 0) {
        // Se não houver cards, começar do 0, senão encontrar o maior número
        const allCards = [...(curriculum.block1 || []), ...(curriculum.block2 || [])];
        if (allCards.length > 0) {
            const maxId = allCards.map(c => {
                const parts = c.id.split('-');
                if (parts.length > 1) {
                    const idNum = parseInt(parts[parts.length - 1]);
                    return isNaN(idNum) ? 0 : idNum;
                }
                return 0;
            });
            cardCounter = (maxId.length > 0 ? Math.max(...maxId) : 0) + 1;
        } else {
            cardCounter = 1;
        }
    }
    
    // Se não houver tópico ainda, tentar pegar do input
    if (!currentTopic) {
        const topicInput = document.getElementById('topic-input');
        if (topicInput && topicInput.value.trim()) {
            currentTopic = topicInput.value.trim();
        }
    }
    
    // Mostrar seção de currículo se estiver oculta
    const curriculumSection = document.getElementById('curriculum-section');
    if (curriculumSection && curriculumSection.style.display === 'none') {
        curriculumSection.style.display = 'block';
    }
    
    const newCard = {
        id: `${blockId}-${cardCounter++}`,
        title: 'Nova Habilidade',
        description: 'Clique em editar para adicionar descrição da habilidade',
        order: curriculum[blockId].length
    };

    curriculum[blockId].push(newCard);
    displayCurriculum();
    updateSaveButton();
    autoSaveIfNeeded();
    editCard(newCard.id, blockId);
}

function editCard(cardId, blockId) {
    const card = curriculum[blockId].find(c => c.id === cardId);
    if (!card) return;

    editingCardId = cardId;
    editingBlockId = blockId;

    document.getElementById('edit-title').value = card.title || '';
    document.getElementById('edit-description').value = card.description || '';
    document.getElementById('edit-modal').style.display = 'block';
}

function saveCardEdit() {
    if (!editingCardId || !editingBlockId) return;

    const title = document.getElementById('edit-title').value.trim();
    const description = document.getElementById('edit-description').value.trim();

    if (!title) {
        alert('Por favor, digite um título');
        return;
    }

    const card = curriculum[editingBlockId].find(c => c.id === editingCardId);
    if (card) {
        card.title = title;
        card.description = description;
        displayCurriculum();
        autoSaveIfNeeded();
    }

    closeEditModal();
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
    editingCardId = null;
    editingBlockId = null;
}

function removeCard(cardId, blockId) {
    if (!confirm('Tem certeza que deseja remover esta habilidade?')) {
        return;
    }

    curriculum[blockId] = curriculum[blockId].filter(c => c.id !== cardId);
    curriculum[blockId].forEach((card, index) => {
        card.order = index;
    });
    displayCurriculum();
    autoSaveIfNeeded();
}

// ============================================================================
// DRAG AND DROP
// ============================================================================
// Sistema de arrastar e soltar para reordenar cards

let draggedElement = null;  // Elemento sendo arrastado no momento

function allowDrop(ev) {
    ev.preventDefault();
}

function dragStart(ev) {
    draggedElement = ev.target;
    ev.target.classList.add('dragging');
    ev.dataTransfer.effectAllowed = 'move';
}

function dragEnd(ev) {
    ev.target.classList.remove('dragging');
}

function drop(ev) {
    ev.preventDefault();
    
    if (!draggedElement) return;

    const targetContainer = ev.currentTarget;
    const targetBlockId = targetContainer.id;
    
    const cardId = draggedElement.id;
    const sourceBlockId = draggedElement.dataset.blockId;
    
    let card = null;
    let cardIndex = -1;
    
    if (curriculum[sourceBlockId]) {
        cardIndex = curriculum[sourceBlockId].findIndex(c => c.id === cardId);
        if (cardIndex !== -1) {
            card = curriculum[sourceBlockId][cardIndex];
        }
    }

    if (!card) return;

    const afterElement = getDragAfterElement(targetContainer, ev.clientY);
    
    if (targetBlockId !== sourceBlockId) {
        curriculum[sourceBlockId].splice(cardIndex, 1);
        const idParts = card.id.split('-');
        card.id = `${targetBlockId}-${idParts.slice(1).join('-')}`;
        draggedElement.id = card.id;
        draggedElement.dataset.blockId = targetBlockId;
        
        if (afterElement == null) {
            targetContainer.appendChild(draggedElement);
            curriculum[targetBlockId].push(card);
        } else {
            targetContainer.insertBefore(draggedElement, afterElement);
            const afterCardId = afterElement.id;
            const insertIndex = curriculum[targetBlockId].findIndex(c => c.id === afterCardId);
            if (insertIndex !== -1) {
                curriculum[targetBlockId].splice(insertIndex, 0, card);
            } else {
                curriculum[targetBlockId].push(card);
            }
        }
    } else {
        if (afterElement == null) {
            targetContainer.appendChild(draggedElement);
            curriculum[targetBlockId].splice(cardIndex, 1);
            curriculum[targetBlockId].push(card);
        } else {
            targetContainer.insertBefore(draggedElement, afterElement);
            const afterCardId = afterElement.id;
            const insertIndex = curriculum[targetBlockId].findIndex(c => c.id === afterCardId);
            
            if (insertIndex !== -1) {
                curriculum[targetBlockId].splice(cardIndex, 1);
                const newInsertIndex = cardIndex < insertIndex ? insertIndex - 1 : insertIndex;
                curriculum[targetBlockId].splice(newInsertIndex, 0, card);
            }
        }
    }

    updateCardOrders();
    displayCurriculum();
    autoSaveIfNeeded();
    draggedElement = null;
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.topic-card:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateCardOrders() {
    ['block1', 'block2'].forEach(blockId => {
        const container = document.getElementById(blockId);
        const cards = container.querySelectorAll('.topic-card');
        cards.forEach((cardElement, index) => {
            const cardId = cardElement.id;
            const card = curriculum[blockId].find(c => c.id === cardId);
            if (card) {
                card.order = index;
                cardElement.dataset.order = index;
            }
        });
    });
}

// ============================================================================
// GERENCIAMENTO DE SESSÕES (LOCALSTORAGE)
// ============================================================================
// Sistema de persistência usando LocalStorage do navegador
// Permite salvar e carregar sessões de trabalho

function getAllSessions() {
    /**
     * Carrega todas as sessões salvas do LocalStorage.
     * 
     * Returns:
     *     Dict: Objeto com todas as sessões (sessionId -> sessionData)
     */
    try {
        const sessions = localStorage.getItem(STORAGE_KEY);
        return sessions ? JSON.parse(sessions) : {};
    } catch (e) {
        console.error('Erro ao carregar sessões:', e);
        return {};
    }
}

function saveSessions(sessions) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
        console.error('Erro ao salvar sessões:', e);
        alert('Erro ao salvar sessão. O localStorage pode estar cheio.');
    }
}

function saveCurrentSession() {
    // Permitir salvar mesmo sem tópico se houver curriculum
    const hasCurriculum = curriculum && (
        (curriculum.block1 && curriculum.block1.length > 0) ||
        (curriculum.block2 && curriculum.block2.length > 0)
    );
    
    if (!currentTopic && !hasCurriculum) {
        alert('Não há sessão para salvar. Adicione um tópico ou crie habilidades primeiro.');
        return;
    }
    
    document.getElementById('save-session-modal').style.display = 'block';
    const nameInput = document.getElementById('session-name-input');
    nameInput.value = currentTopic || 'Nova Sessão';
    nameInput.focus();
    nameInput.select();
}

function confirmSaveSession() {
    const sessionName = document.getElementById('session-name-input').value.trim();
    
    if (!sessionName) {
        alert('Por favor, digite um nome para a sessão.');
        return;
    }
    
    let sourcesToSave = [];
    if (researchSources.length > 0 && selectedSources.size > 0) {
        sourcesToSave = researchSources.filter((source, index) => {
            const sourceId = source.id || `source-${index}`;
            return selectedSources.has(sourceId);
        });
    } else if (researchSources.length > 0) {
        sourcesToSave = researchSources;
    }
    
    const session = {
        id: currentSessionId || Date.now().toString(),
        name: sessionName,
        topic: currentTopic,
        researchSources: sourcesToSave,
        allResearchSources: researchSources,
        selectedSources: Array.from(selectedSources),
        curriculum: {
            block1: [...curriculum.block1],
            block2: [...curriculum.block2]
        },
        methodCardPrompts: {...methodCardPrompts},
        cardCounter: cardCounter,
        savedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    const sessions = getAllSessions();
    sessions[session.id] = session;
    saveSessions(sessions);
    
    currentSessionId = session.id;
    closeSaveSessionModal();
    updateSaveButton();
    alert(`Sessão "${sessionName}" salva com sucesso!`);
}

function loadSession(sessionId) {
    const sessions = getAllSessions();
    const session = sessions[sessionId];
    
    if (!session) {
        alert('Sessão não encontrada.');
        return;
    }
    
    if (currentTopic && !confirm('Isso vai substituir a sessão atual. Continuar?')) {
        return;
    }
    
    currentTopic = session.topic || '';
    researchSources = session.allResearchSources || session.researchSources || [];
    selectedSources = new Set(session.selectedSources || []);
    
    // Garantir que curriculum está inicializado corretamente
    curriculum = {
        block1: session.curriculum?.block1 || [],
        block2: session.curriculum?.block2 || []
    };
    
    // Garantir que os blocos existem
    if (!curriculum.block1) curriculum.block1 = [];
    if (!curriculum.block2) curriculum.block2 = [];
    
    methodCardPrompts = session.methodCardPrompts || {};
    
    // Atualizar cardCounter baseado nos IDs existentes
    const allCards = [...curriculum.block1, ...curriculum.block2];
    if (allCards.length > 0) {
        const maxId = allCards.map(c => {
            const parts = c.id.split('-');
            if (parts.length > 1) {
                const idNum = parseInt(parts[parts.length - 1]);
                return isNaN(idNum) ? 0 : idNum;
            }
            return 0;
        });
        cardCounter = (maxId.length > 0 ? Math.max(...maxId) : 0) + 1;
    } else {
        cardCounter = session.cardCounter || 1;
    }
    
    currentSessionId = session.id;
    
    document.getElementById('topic-input').value = currentTopic;
    
    if (researchSources.length > 0) {
        displaySources(researchSources);
        document.getElementById('sources-section').style.display = 'block';
    }
    
    // Sempre mostrar seção de currículo se houver curriculum ou permitir adicionar manualmente
    if (curriculum.block1.length > 0 || curriculum.block2.length > 0) {
        displayCurriculum();
        document.getElementById('curriculum-section').style.display = 'block';
    } else {
        // Se não houver curriculum, ainda mostrar a seção para permitir adicionar manualmente
        displayCurriculum();
        document.getElementById('curriculum-section').style.display = 'block';
    }
    
    updateSaveButton();
    closeSessionsModal();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteSession(sessionId) {
    if (!confirm('Tem certeza que deseja excluir esta sessão?')) {
        return;
    }
    
    const sessions = getAllSessions();
    delete sessions[sessionId];
    saveSessions(sessions);
    
    if (currentSessionId === sessionId) {
        currentSessionId = null;
        updateSaveButton();
    }
    
    displaySessionsList();
}

function displaySessionsList() {
    const sessions = getAllSessions();
    const sessionsList = document.getElementById('sessions-list');
    
    if (Object.keys(sessions).length === 0) {
        sessionsList.innerHTML = '<p class="sessions-empty-message">Nenhuma sessão salva ainda.</p>';
        return;
    }
    
    const sortedSessions = Object.values(sessions).sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.savedAt || 0);
        const dateB = new Date(b.updatedAt || b.savedAt || 0);
        return dateB - dateA;
    });
    
    sessionsList.innerHTML = sortedSessions.map(session => {
        const date = new Date(session.updatedAt || session.savedAt);
        const dateStr = date.toLocaleString('pt-BR');
        const isCurrent = currentSessionId === session.id;
        const curriculumCount = (session.curriculum?.block1?.length || 0) + (session.curriculum?.block2?.length || 0);
        const currentClass = isCurrent ? ' session-item-current' : '';
        
        return `
            <div class="session-item${currentClass}">
                <div class="session-item-content">
                    <div class="session-item-info">
                        <h4>${isCurrent ? '✓ ' : ''}${escapeHtml(session.name)}</h4>
                        <p><strong>Tópico:</strong> ${escapeHtml(session.topic || 'N/A')}</p>
                        <p><strong>Habilidades:</strong> ${curriculumCount} | 
                           <strong>Fontes:</strong> ${session.researchSources?.length || 0} | 
                           <strong>Atualizado:</strong> ${dateStr}</p>
                    </div>
                    <div class="session-actions">
                        <button class="btn btn-small btn-primary" onclick="loadSession('${session.id}')">
                            Carregar
                        </button>
                        <button class="btn btn-small btn-danger" onclick="deleteSession('${session.id}')">
                            Excluir
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function openSessionsModal() {
    displaySessionsList();
    document.getElementById('sessions-modal').style.display = 'block';
}

function closeSessionsModal() {
    document.getElementById('sessions-modal').style.display = 'none';
}

function closeSaveSessionModal() {
    document.getElementById('save-session-modal').style.display = 'none';
    document.getElementById('session-name-input').value = '';
}

function updateSaveButton() {
    const saveBtn = document.getElementById('save-session-btn');
    // Mostrar botão se houver tópico ou curriculum
    const hasCurriculum = curriculum && (
        (curriculum.block1 && curriculum.block1.length > 0) ||
        (curriculum.block2 && curriculum.block2.length > 0)
    );
    
    if (currentTopic || hasCurriculum) {
        saveBtn.style.display = 'inline-block';
        saveBtn.textContent = currentSessionId ? '💾 Salvar Alterações' : '💾 Salvar Sessão';
    } else {
        saveBtn.style.display = 'none';
    }
}

function checkForAutoSave() {
    updateSaveButton();
}

function autoSaveIfNeeded() {
    if (currentSessionId && currentTopic) {
        const sessions = getAllSessions();
        if (sessions[currentSessionId]) {
            const session = sessions[currentSessionId];
            
            let sourcesToSave = [];
            if (researchSources.length > 0 && selectedSources.size > 0) {
                sourcesToSave = researchSources.filter((source, index) => {
                    const sourceId = source.id || `source-${index}`;
                    return selectedSources.has(sourceId);
                });
            } else if (researchSources.length > 0) {
                sourcesToSave = researchSources;
            }
            
            session.topic = currentTopic;
            session.researchSources = sourcesToSave;
            session.allResearchSources = researchSources;
            session.selectedSources = Array.from(selectedSources);
            session.curriculum = {
                block1: [...curriculum.block1],
                block2: [...curriculum.block2]
            };
            session.methodCardPrompts = {...methodCardPrompts};
            session.cardCounter = cardCounter;
            session.updatedAt = new Date().toISOString();
            
            sessions[currentSessionId] = session;
            saveSessions(sessions);
        }
    }
}

// ============================================================================
// METHOD CARDS MODAL
// ============================================================================
// Gerencia o modal de geração de prompts para ferramentas educacionais

function openMethodCardsModal(cardId, blockId) {
    /**
     * Abre o modal de method cards para um subtópico específico.
     * 
     * FLUXO:
     * 1. Encontra o card no currículo
     * 2. Carrega prompts existentes (se houver)
     * 3. Exibe modal com 5 tipos de method cards
     * 
     * Args:
     *     cardId: ID do card/subtópico
     *     blockId: ID do bloco ('block1' ou 'block2')
     */
    const card = curriculum[blockId]?.find(c => c.id === cardId);
    if (!card) {
        alert(`Erro: Habilidade não encontrada. ID: ${cardId}, Bloco: ${blockId}`);
        return;
    }
    
    currentMethodCardSubtopic = cardId;
    
    const titleEl = document.getElementById('method-cards-modal-title');
    const descEl = document.getElementById('method-cards-modal-description');
    if (titleEl) titleEl.textContent = `📋 Gerar Prompts Personalizados: ${card.title}`;
    if (descEl) descEl.textContent = card.description || '';
    
    // Resetar todos os resultados
    ['video', 'theory', 'case_study', 'practice', 'quiz'].forEach(type => {
        document.getElementById(`result-${type}`).style.display = 'none';
        document.getElementById(`edit-${type}-btn`).style.display = 'none';
        const methodCard = document.querySelector(`.method-card[data-type="${type}"]`);
        if (methodCard) methodCard.classList.remove('has-prompt');
    });
    
    // Carregar prompts existentes
    if (methodCardPrompts[cardId]) {
        const prompts = methodCardPrompts[cardId];
        ['video', 'theory', 'case_study', 'practice', 'quiz'].forEach(type => {
            if (prompts[type]) {
                document.getElementById(`prompt-${type}`).value = prompts[type];
                document.getElementById(`result-${type}`).style.display = 'block';
                document.getElementById(`edit-${type}-btn`).style.display = 'inline-block';
                const methodCard = document.querySelector(`.method-card[data-type="${type}"]`);
                if (methodCard) methodCard.classList.add('has-prompt');
            }
        });
    }
    
    const modal = document.getElementById('method-cards-modal');
    if (!modal) {
        alert('Erro: Modal não encontrado. Por favor, recarregue a página.');
        return;
    }
    
    modal.style.display = 'block';
    modal.classList.add('show');
}

window.openMethodCardsModal = openMethodCardsModal;

function closeMethodCardsModal() {
    const modal = document.getElementById('method-cards-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
    }
    currentMethodCardSubtopic = null;
    ['video', 'theory', 'case_study', 'practice', 'quiz'].forEach(type => {
        const resultEl = document.getElementById(`result-${type}`);
        const editBtn = document.getElementById(`edit-${type}-btn`);
        if (resultEl) resultEl.style.display = 'none';
        if (editBtn) editBtn.style.display = 'none';
    });
}

window.closeMethodCardsModal = closeMethodCardsModal;

window.generateMethodCardPrompt = async function(methodCardType) {
    if (!currentMethodCardSubtopic) return;
    
    let card = null;
    let blockId = null;
    for (const [bid, cards] of Object.entries(curriculum)) {
        card = cards.find(c => c.id === currentMethodCardSubtopic);
        if (card) {
            blockId = bid;
            break;
        }
    }
    
    if (!card || !blockId) {
        alert('Erro: Card não encontrado');
        return;
    }
    
    const previousSubtopics = [];
    const cardIndex = curriculum[blockId].findIndex(c => c.id === currentMethodCardSubtopic);
    for (let i = 0; i < cardIndex; i++) {
        previousSubtopics.push(curriculum[blockId][i]);
    }
    
    const methodCard = document.querySelector(`.method-card[data-type="${methodCardType}"]`);
    const btn = methodCard ? methodCard.querySelector('.btn-primary') : null;
    const originalText = btn ? btn.textContent : 'Gerar';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Gerando...';
    }
    
    try {
        const response = await fetch('/api/generate-method-card-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                topic: currentTopic,
                subtopic_id: currentMethodCardSubtopic,
                subtopic_title: card.title,
                subtopic_description: card.description || '',
                block_id: blockId,
                previous_subtopics: previousSubtopics,
                research_sources: researchSources,
                method_card_type: methodCardType
            })
        });
        
        if (!response.ok) throw new Error('Falha na geração do prompt');
        
        const data = await response.json();
        
        if (!methodCardPrompts[currentMethodCardSubtopic]) {
            methodCardPrompts[currentMethodCardSubtopic] = {};
        }
        methodCardPrompts[currentMethodCardSubtopic][methodCardType] = data.prompt;
        
        document.getElementById(`prompt-${methodCardType}`).value = data.prompt;
        document.getElementById(`result-${methodCardType}`).style.display = 'block';
        document.getElementById(`edit-${methodCardType}-btn`).style.display = 'inline-block';
        
        const methodCard = document.querySelector(`.method-card[data-type="${methodCardType}"]`);
        if (methodCard) methodCard.classList.add('has-prompt');
        
        autoSaveIfNeeded();
        displayCurriculum();
        
    } catch (error) {
        alert(`Erro ao gerar prompt: ${error.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

function editMethodCardPrompt(methodCardType) {
    const textarea = document.getElementById(`prompt-${methodCardType}`);
    textarea.readOnly = !textarea.readOnly;
    
    const btn = document.getElementById(`edit-${methodCardType}-btn`);
    if (textarea.readOnly) {
        btn.textContent = 'Editar';
        if (methodCardPrompts[currentMethodCardSubtopic]) {
            methodCardPrompts[currentMethodCardSubtopic][methodCardType] = textarea.value;
            autoSaveIfNeeded();
            displayCurriculum();
        }
    } else {
        btn.textContent = 'Salvar';
    }
}

function copyMethodCardPrompt(methodCardType) {
    const textarea = document.getElementById(`prompt-${methodCardType}`);
    if (!textarea) return;
    
    textarea.select();
    document.execCommand('copy');
    
    const btn = event ? event.target : null;
    if (btn) {
        const originalText = btn.textContent;
        btn.textContent = 'Copiado!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 1000);
    }
}

// ============================================================================
// CHATBOT FUNCTIONS
// ============================================================================

function toggleChatbot() {
    const modal = document.getElementById('chatbot-modal');
    if (!modal) return;
    
    isChatbotOpen = !isChatbotOpen;
    if (isChatbotOpen) {
        modal.style.display = 'block';
        modal.classList.add('show');
        const input = document.getElementById('chatbot-input');
        if (input) {
            setTimeout(() => input.focus(), 100);
        }
    } else {
        modal.style.display = 'none';
        modal.classList.remove('show');
    }
}

window.toggleChatbot = toggleChatbot;

function handleChatbotKeyPress(event) {
    if (event.key === 'Enter') {
        sendChatbotMessage();
    }
}

window.handleChatbotKeyPress = handleChatbotKeyPress;
window.sendChatbotMessage = sendChatbotMessage;

async function sendChatbotMessage() {
    const input = document.getElementById('chatbot-input');
    if (!input) return;
    
    const message = input.value.trim();
    if (!message) return;
    
    // Add user message to chat
    addChatMessage('user', message);
    input.value = '';
    
    // Disable input while processing
    const sendBtn = document.getElementById('chatbot-send-btn');
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Enviando...';
    }
    if (input) input.disabled = true;
    
    // Show loading message
    const loadingMessageId = addChatMessage('assistant', 'Processando...', true);
    
    try {
        // Validate curriculum state
        if (!curriculum || (!curriculum.block1 && !curriculum.block2)) {
            removeChatMessage(loadingMessageId);
            addChatMessage('assistant', 'Erro: Não há currículo disponível. Crie um currículo primeiro.');
            return;
        }
        
        const response = await fetch('/api/chatbot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                topic: currentTopic || '',
                research_sources: researchSources || [],
                curriculum: {
                    block1: curriculum.block1 || [],
                    block2: curriculum.block2 || []
                },
                chat_history: chatHistory.slice(-10) // Last 10 messages for context
            })
        });
        
        removeChatMessage(loadingMessageId);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro do servidor: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            addChatMessage('assistant', `Erro: ${data.error}`);
        } else if (data.actions && data.actions.length > 0) {
            // Validate actions before executing
            const validationErrors = validateChatbotActions(data.actions);
            if (validationErrors.length > 0) {
                addChatMessage('assistant', `Erro de validação: ${validationErrors.join(', ')}`);
                return;
            }
            
            // Execute actions
            const results = executeChatbotActions(data.actions);
            const successCount = results.success;
            const failedActions = results.failed;
            
            if (successCount > 0) {
                let successMessage = data.message || `Executado: ${successCount} ação(ões)`;
                if (failedActions.length > 0) {
                    successMessage += `. ${failedActions.length} ação(ões) falharam.`;
                }
                addChatMessage('assistant', successMessage);
                
                // Display feedback questions if available
                if (data.feedback_questions && data.feedback_questions.length > 0) {
                    displayFeedbackQuestions(data.feedback_questions);
                }
            } else {
                addChatMessage('assistant', 'Não foi possível executar as ações solicitadas. Verifique se os IDs dos cards estão corretos ou se o comando está claro.');
            }
        } else {
            addChatMessage('assistant', data.message || 'Não entendi o comando. Tente ser mais específico. Exemplos: "Adicione um card sobre X no bloco 1", "Mova o primeiro card para o final", "Edite o card sobre Y".');
        }
        
    } catch (error) {
        removeChatMessage(loadingMessageId);
        let errorMessage = 'Erro ao processar comando.';
        if (error.message) {
            errorMessage = `Erro: ${error.message}`;
        }
        addChatMessage('assistant', errorMessage);
        console.error('Erro no chatbot:', error);
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Enviar';
        }
        if (input) {
            input.disabled = false;
            input.focus();
        }
    }
}

function addChatMessage(role, content, isTemporary = false) {
    const messageId = `msg-${Date.now()}-${Math.random()}`;
    chatHistory.push({ role, content, timestamp: new Date().toISOString(), id: messageId });
    
    const messagesContainer = document.getElementById('chatbot-messages');
    if (!messagesContainer) return messageId;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chatbot-message chatbot-message-${role}`;
    messageDiv.id = messageId;
    if (isTemporary) {
        messageDiv.classList.add('chatbot-message-temporary');
    }
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'chatbot-message-content';
    contentDiv.textContent = content;
    
    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    return messageId;
}

function removeChatMessage(messageId) {
    if (!messageId) return;
    const messageDiv = document.getElementById(messageId);
    if (messageDiv) {
        messageDiv.remove();
    }
    // Remove from history
    chatHistory = chatHistory.filter(msg => msg.id !== messageId);
}

function displayFeedbackQuestions(questions) {
    if (!questions || questions.length === 0) return;
    
    const messagesContainer = document.getElementById('chatbot-messages');
    if (!messagesContainer) return;
    
    const questionsDiv = document.createElement('div');
    questionsDiv.className = 'chatbot-feedback-questions';
    
    const questionsTitle = document.createElement('div');
    questionsTitle.className = 'chatbot-feedback-title';
    questionsTitle.textContent = '💡 Perguntas de feedback:';
    questionsDiv.appendChild(questionsTitle);
    
    questions.forEach((question, index) => {
        const questionItem = document.createElement('div');
        questionItem.className = 'chatbot-feedback-question';
        questionItem.textContent = `${index + 1}. ${question}`;
        questionsDiv.appendChild(questionItem);
    });
    
    messagesContainer.appendChild(questionsDiv);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function validateChatbotActions(actions) {
    const errors = [];
    
    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        
        if (!action.type) {
            errors.push(`Ação ${i + 1}: tipo não especificado`);
            continue;
        }
        
        switch (action.type) {
            case 'add':
                if (!action.blockId || (action.blockId !== 'block1' && action.blockId !== 'block2')) {
                    errors.push(`Ação ${i + 1}: blockId inválido`);
                }
                if (!action.title || typeof action.title !== 'string' || action.title.trim() === '') {
                    errors.push(`Ação ${i + 1}: título inválido`);
                }
                break;
            case 'edit':
                if (!action.cardId || typeof action.cardId !== 'string') {
                    errors.push(`Ação ${i + 1}: cardId inválido`);
                }
                if (action.title === undefined && action.description === undefined) {
                    errors.push(`Ação ${i + 1}: nenhum campo para editar`);
                }
                break;
            case 'remove':
                if (!action.cardId || typeof action.cardId !== 'string') {
                    errors.push(`Ação ${i + 1}: cardId inválido`);
                }
                break;
            case 'reorder':
                if (!action.blockId || (action.blockId !== 'block1' && action.blockId !== 'block2')) {
                    errors.push(`Ação ${i + 1}: blockId inválido`);
                }
                if (!action.cardIds || !Array.isArray(action.cardIds) || action.cardIds.length === 0) {
                    errors.push(`Ação ${i + 1}: cardIds inválido ou vazio`);
                }
                break;
            default:
                errors.push(`Ação ${i + 1}: tipo desconhecido "${action.type}"`);
        }
    }
    
    return errors;
}

function executeChatbotActions(actions) {
    let successCount = 0;
    const failed = [];
    
    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        try {
            let success = false;
            
            switch (action.type) {
                case 'add':
                    success = addCardFromChatbot(action.blockId, action.title, action.description, action.position);
                    break;
                case 'edit':
                    success = editCardFromChatbot(action.cardId, action.title, action.description);
                    break;
                case 'remove':
                    success = removeCardFromChatbot(action.cardId);
                    break;
                case 'reorder':
                    success = updateCardOrder(action.blockId, action.cardIds);
                    break;
                default:
                    console.warn(`Tipo de ação desconhecido: ${action.type}`);
                    failed.push({ index: i, type: action.type, reason: 'Tipo desconhecido' });
                    continue;
            }
            
            if (success) {
                successCount++;
            } else {
                failed.push({ index: i, type: action.type, reason: 'Execução falhou' });
            }
        } catch (error) {
            console.error(`Erro ao executar ação ${action.type}:`, error);
            failed.push({ index: i, type: action.type, reason: error.message });
        }
    }
    
    return { success: successCount, failed };
}

function addCardFromChatbot(blockId, title, description, position) {
    try {
        if (!blockId || !title) {
            console.error('addCardFromChatbot: blockId ou title ausente');
            return false;
        }
        if (blockId !== 'block1' && blockId !== 'block2') {
            console.error(`addCardFromChatbot: blockId inválido: ${blockId}`);
            return false;
        }
        
        // Ensure curriculum is initialized
        if (!curriculum) {
            curriculum = { block1: [], block2: [] };
        }
        if (!curriculum[blockId]) {
            curriculum[blockId] = [];
        }
        
        // Initialize cardCounter if needed
        if (cardCounter === 0) {
            const allCards = [...(curriculum.block1 || []), ...(curriculum.block2 || [])];
            if (allCards.length > 0) {
                const maxId = allCards.map(c => {
                    const parts = c.id.split('-');
                    if (parts.length > 1) {
                        const idNum = parseInt(parts[parts.length - 1]);
                        return isNaN(idNum) ? 0 : idNum;
                    }
                    return 0;
                });
                cardCounter = (maxId.length > 0 ? Math.max(...maxId) : 0) + 1;
            } else {
                cardCounter = 1;
            }
        }
        
        const newCard = {
            id: `${blockId}-${cardCounter++}`,
            title: title.trim(),
            description: (description || '').trim(),
            order: position !== undefined && position >= 0 ? position : curriculum[blockId].length
        };
        
        if (position !== undefined && position >= 0 && position < curriculum[blockId].length) {
            curriculum[blockId].splice(position, 0, newCard);
            // Update orders
            curriculum[blockId].forEach((card, index) => {
                card.order = index;
            });
        } else {
            newCard.order = curriculum[blockId].length;
            curriculum[blockId].push(newCard);
        }
        
        displayCurriculum();
        updateSaveButton();
        autoSaveIfNeeded();
        return true;
    } catch (error) {
        console.error('Erro em addCardFromChatbot:', error);
        return false;
    }
}

function editCardFromChatbot(cardId, title, description) {
    try {
        if (!cardId || typeof cardId !== 'string') {
            console.error('editCardFromChatbot: cardId inválido');
            return false;
        }
        
        let card = null;
        let blockId = null;
        
        // Find card in both blocks
        for (const bid of ['block1', 'block2']) {
            if (curriculum[bid]) {
                card = curriculum[bid].find(c => c.id === cardId);
                if (card) {
                    blockId = bid;
                    break;
                }
            }
        }
        
        if (!card || !blockId) {
            console.error(`editCardFromChatbot: card não encontrado: ${cardId}`);
            return false;
        }
        
        if (title !== undefined && title !== null && typeof title === 'string') {
            card.title = title.trim();
        }
        if (description !== undefined && description !== null && typeof description === 'string') {
            card.description = description.trim();
        }
        
        displayCurriculum();
        updateSaveButton();
        autoSaveIfNeeded();
        return true;
    } catch (error) {
        console.error('Erro em editCardFromChatbot:', error);
        return false;
    }
}

function removeCardFromChatbot(cardId) {
    try {
        if (!cardId || typeof cardId !== 'string') {
            console.error('removeCardFromChatbot: cardId inválido');
            return false;
        }
        
        let found = false;
        
        for (const blockId of ['block1', 'block2']) {
            if (curriculum[blockId]) {
                const index = curriculum[blockId].findIndex(c => c.id === cardId);
                if (index !== -1) {
                    curriculum[blockId].splice(index, 1);
                    // Update orders
                    curriculum[blockId].forEach((card, idx) => {
                        card.order = idx;
                    });
                    found = true;
                    break;
                }
            }
        }
        
        if (found) {
            displayCurriculum();
            updateSaveButton();
            autoSaveIfNeeded();
            return true;
        } else {
            console.error(`removeCardFromChatbot: card não encontrado: ${cardId}`);
            return false;
        }
    } catch (error) {
        console.error('Erro em removeCardFromChatbot:', error);
        return false;
    }
}

function updateCardOrder(blockId, cardIds) {
    try {
        if (!blockId || !cardIds || !Array.isArray(cardIds)) {
            console.error('updateCardOrder: parâmetros inválidos');
            return false;
        }
        if (blockId !== 'block1' && blockId !== 'block2') {
            console.error(`updateCardOrder: blockId inválido: ${blockId}`);
            return false;
        }
        if (!curriculum[blockId]) {
            console.error(`updateCardOrder: bloco não existe: ${blockId}`);
            return false;
        }
        
        // Verify all card IDs exist in the block
        const existingCards = curriculum[blockId];
        const existingIds = new Set(existingCards.map(c => c.id));
        
        // Check if all provided IDs exist
        for (const id of cardIds) {
            if (!existingIds.has(id)) {
                console.error(`updateCardOrder: ID não encontrado no bloco: ${id}`);
                return false; // Invalid ID
            }
        }
        
        // Check if we have all cards (reorder should include all cards)
        if (cardIds.length !== existingCards.length) {
            // If not all cards provided, we'll reorder only the provided ones
            // and keep others in their current positions
            const providedIds = new Set(cardIds);
            const otherCards = existingCards.filter(c => !providedIds.has(c.id));
            
            // Reorder provided cards
            const reorderedCards = [];
            for (const id of cardIds) {
                const card = existingCards.find(c => c.id === id);
                if (card) reorderedCards.push(card);
            }
            
            // Combine: provided cards in new order, then others
            curriculum[blockId] = [...reorderedCards, ...otherCards];
        } else {
            // Reorder all cards
            const cardMap = new Map(existingCards.map(c => [c.id, c]));
            curriculum[blockId] = cardIds.map(id => cardMap.get(id)).filter(Boolean);
        }
        
        // Update orders
        curriculum[blockId].forEach((card, index) => {
            card.order = index;
        });
        
        displayCurriculum();
        updateSaveButton();
        autoSaveIfNeeded();
        return true;
    } catch (error) {
        console.error('Erro em updateCardOrder:', error);
        return false;
    }
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// EVENT HANDLERS GLOBAIS
// ============================================================================

window.onclick = function(event) {
    const sessionsModal = document.getElementById('sessions-modal');
    const saveModal = document.getElementById('save-session-modal');
    const editModal = document.getElementById('edit-modal');
    const methodCardsModal = document.getElementById('method-cards-modal');
    
    // Não fechar se o clique foi dentro do modal-content
    if (event.target.closest('.modal-content')) {
        return;
    }
    
    if (event.target == sessionsModal) closeSessionsModal();
    if (event.target == saveModal) closeSaveSessionModal();
    if (event.target == editModal) closeEditModal();
    if (event.target == methodCardsModal) closeMethodCardsModal();
}
