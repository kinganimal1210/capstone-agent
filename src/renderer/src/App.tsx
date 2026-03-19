import React from 'react'
import './App.css'

function App(): React.JSX.Element {
  return (
    <div className="app">
      <aside className="sidebar">
        <h1 className="logo">캡스톤에이전트</h1>
        <nav>
          <ul>
            <li className="active">프로젝트</li>
            <li>회의록</li>
            <li>태스크</li>
            <li>질의</li>
          </ul>
        </nav>
      </aside>
      <main className="main">
        <h2>프로젝트를 선택하세요</h2>
        <p>왼쪽 사이드바에서 기능을 선택하거나 새 프로젝트를 만들어 시작하세요.</p>
      </main>
    </div>
  )
}

export default App
