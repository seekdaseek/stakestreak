import React from 'react';
import {Modal, View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {C} from '../theme';

// Controlled confirm modal. Props:
//  visible, title, message, emoji,
//  confirmText, onConfirm, cancelText, onCancel, destructive
export default function ConfirmModal({visible, title, message, emoji, confirmText, onConfirm, cancelText, onCancel, destructive}) {
  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={st.backdrop}>
        <View style={st.card}>
          {!!emoji && <Text style={st.emoji}>{emoji}</Text>}
          <Text style={st.title}>{title || ''}</Text>
          {!!message && <Text style={st.msg}>{message}</Text>}
          <View style={st.row}>
            {!!cancelText && (
              <TouchableOpacity style={[st.btn, st.btnGhost]} onPress={onCancel}>
                <Text style={st.btnGhostText}>{cancelText}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[st.btn, destructive ? st.btnDanger : st.btnPrimary]} onPress={onConfirm}>
              <Text style={st.btnText}>{confirmText || 'OK'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 32},
  card: {backgroundColor: C.card, borderRadius: 24, padding: 26, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: C.cardEdge, elevation: 12},
  emoji: {fontSize: 42, marginBottom: 8},
  title: {fontSize: 20, fontWeight: '900', color: C.text, textAlign: 'center'},
  msg: {fontSize: 15, color: C.textDim, textAlign: 'center', marginTop: 8, lineHeight: 21},
  row: {flexDirection: 'row', gap: 10, marginTop: 22, width: '100%'},
  btn: {flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center'},
  btnPrimary: {backgroundColor: C.orange},
  btnDanger: {backgroundColor: C.red},
  btnGhost: {backgroundColor: 'transparent', borderWidth: 1, borderColor: C.cardEdge},
  btnText: {color: C.text, fontWeight: '900', fontSize: 15},
  btnGhostText: {color: C.textDim, fontWeight: '800', fontSize: 15},
});
