import React, {createContext, useContext, useState, useCallback} from 'react';
import {Modal, View, Text, TouchableOpacity, StyleSheet} from 'react-native';

const Ctx = createContext(null);
export const useToast = () => useContext(Ctx);

export function ToastProvider({children}) {
  const [t, setT] = useState(null);
  const show = useCallback((title, msg, kind) => setT({title, msg, kind: kind || 'info'}), []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <Modal visible={!!t} transparent animationType="fade" onRequestClose={() => setT(null)}>
        <View style={st.backdrop}>
          <View style={st.card}>
            <Text style={st.emoji}>{t && t.kind === 'win' ? '\uD83D\uDD25' : t && t.kind === 'error' ? '\uD83D\uDE2C' : '\uD83D\uDC4B'}</Text>
            <Text style={st.title}>{t ? t.title : ''}</Text>
            {!!(t && t.msg) && <Text style={st.msg}>{t.msg}</Text>}
            <TouchableOpacity style={st.btn} onPress={() => setT(null)}>
              <Text style={st.btnText}>{t && t.kind === 'win' ? "Let's go" : 'OK'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Ctx.Provider>
  );
}

const st = StyleSheet.create({
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 32},
  card: {backgroundColor: '#241A15', borderRadius: 24, padding: 28, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: '#3A2E24', elevation: 12},
  emoji: {fontSize: 44, marginBottom: 8},
  title: {fontSize: 20, fontWeight: '800', color: '#FFFFFF', textAlign: 'center'},
  msg: {fontSize: 15, color: '#8A7E72', textAlign: 'center', marginTop: 8, lineHeight: 21},
  btn: {backgroundColor: '#FF5A36', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 40, marginTop: 20},
  btnText: {color: '#FFFFFF', fontWeight: '800', fontSize: 16},
});
