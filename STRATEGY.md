# Growing Math - Documento Estratégico e Especificação (PRD)

## 1. Visão Geral
O **Growing Math** é uma plataforma de aprendizagem adaptativa que utiliza Inteligência Artificial para transformar o ensino de matemática em uma jornada gamificada e personalizada. O conceito central é a "Árvore do Conhecimento", onde o progresso do aluno é visualizado através do crescimento orgânico de uma árvore digital.

---

## 2. Experiência do Usuário (UX/UI) Imersiva
### Feedback Visual Sofisticado
- **Partículas de Sucesso**: Ao acertar uma questão, o app utiliza sistemas de partículas (Canvas/Lottie) para celebrar a conquista sem interromper o fluxo.
- **Transições de Estado**: Mudanças entre tópicos utilizam "morphing" de elementos para manter a continuidade visual.
- **Micro-animações Estratégicas**: Botões com feedback tátil visual, barras de progresso que "pulsam" ao chegar perto de marcos, e ícones que reagem ao hover.

### Sistema de Recompensas Progressivas
- **Ecossistema Visual**: O XP não é apenas um número; ele desbloqueia novos biomas, espécies de plantas e elementos decorativos para o jardim do aluno.
- **Marcos de Maestria**: Medalhas 3D interativas que podem ser "giradas" e inspecionadas no perfil.

---

## 3. Modo Escola Avançado
### Dashboard Pedagógico
- **Heatmaps de Turma**: Identificação instantânea de quais conceitos (ex: frações) a turma inteira está tendo dificuldade.
- **Previsão de Desempenho**: Algoritmos de ML que analisam o histórico para prever a nota do aluno em exames como ENEM ou SAT com 85% de precisão.
- **Sugestões Automatizadas**: "Professor, 60% da turma errou o conceito de MMC. Sugerimos esta atividade prática de 10 minutos para a próxima aula."

---

## 4. Visão Futurista (v3.0)
- **Tutor IA Multimodal**: Conversação por voz em tempo real com detecção de emoção (frustração vs. engajamento).
- **Realidade Aumentada (AR)**: Visualização de sólidos geométricos e funções 3D projetadas na mesa do aluno.
- **Blockchain Credentials**: Certificados de conclusão emitidos como NFTs em redes de baixo carbono (ex: Polygon) para comprovação de competência.
- **Marketplace de Mentoria**: Conexão segura entre alunos que precisam de ajuda específica e tutores humanos certificados.

---

## 5. Estratégia de Crescimento e Escala
### Aquisição e Retenção
- **Loop Viral**: Desafios "1v1" entre amigos e compartilhamento de conquistas visuais.
- **Modelo Freemium**: Acesso total às trilhas básicas; IA avançada e relatórios detalhados no Premium.
- **Parcerias B2B**: Licenciamento para redes de ensino privadas e governamentais.

### Internacionalização
- Localização não apenas de idioma, mas de currículo (BNCC no Brasil, Common Core nos EUA).

---

## 6. Arquitetura e Escalabilidade Técnica
- **Microsserviços**: Separação entre serviço de Exercícios (IA), serviço de Gamificação e serviço de Dados Escolares.
- **Infraestrutura**: Kubernetes em AWS/GCP com auto-scaling baseado em latência.
- **Segurança**: Criptografia de ponta a ponta, conformidade rigorosa com LGPD e GDPR (especialmente para dados de menores).

---

## 7. Roadmap (24 Meses)

| Trimestre | Foco Principal | Impacto | Esforço |
| :--- | :--- | :--- | :--- |
| **Q1-Q2** | Refinamento da IA Adaptativa e UI Imersiva | Alto | Médio |
| **Q3-Q4** | Lançamento do Modo Escola e Relatórios Pro | Muito Alto | Alto |
| **Q5-Q6** | Integração AR e Tutor de Voz | Médio | Muito Alto |
| **Q7-Q8** | Marketplace e Expansão Internacional | Alto | Alto |

---

## 8. KPIs de Sucesso
- **Educacionais**: Taxa de melhoria na precisão de respostas após intervenção do Tutor IA.
- **Produto**: DAU/MAU (Engajamento diário) e Retention Rate (D30).
- **Negócio**: LTV (Lifetime Value) vs CAC (Custo de Aquisição).
- **Preditivos**: Churn probability baseada em queda de frequência de estudo.

## Versioning and Build Process

1. **Automatic Version Increment**:
   - Each packaging run increments the patch version in `package.json`.

2. **Archive Previous Release**:
   - Before building, artifacts from the current version in `release` are moved to `versionamento/v<current-version>`.
   - Archived files include installer, blockmap, and builder metadata when present.

3. **Build New Installer**:
   - Use `npm run pack:installer`.
   - This runs the automation script and then executes the full Electron installer build.

4. **Output**:
   - The new installer is generated in `release`.

### Commands

Main command (recommended):
```bash
npm run pack:installer
```

Base command without version bump/archive (advanced/manual use):
```bash
npm run pack:installer:base
```
